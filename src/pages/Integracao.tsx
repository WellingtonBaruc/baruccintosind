import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Loader2, Clock, CheckCircle2, XCircle, AlertTriangle, Wifi, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Config {
  id: string;
  ativa: boolean;
  intervalo_minutos: number;
  dias_importacao_inicial: number;
  ultima_sincronizacao: string | null;
}

interface LogEntry {
  id: string;
  tipo: string;
  status: string;
  total_recebidos: number;
  total_inseridos: number;
  total_atualizados: number;
  total_ignorados: number;
  total_erros: number;
  paginas_processadas: number;
  erro_detalhes: string | null;
  duracao_ms: number;
  executado_em: string;
}

interface DiagRow { status_api: string | null; count: number }
interface MismatchInfo { total: number; statuses: { status_atual: string; count: number }[] }

export default function Integracao() {
  const { profile } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagCounts, setDiagCounts] = useState<DiagRow[]>([]);
  const [mismatch, setMismatch] = useState<MismatchInfo>({ total: 0, statuses: [] });
  const [fixing, setFixing] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [historicLoading, setHistoricLoading] = useState(false);
  const [historicProgress, setHistoricProgress] = useState<string | null>(null);
  const [historicDone, setHistoricDone] = useState<{ date: string; count: number } | null>(null);
  const [lastDailyLog, setLastDailyLog] = useState<LogEntry | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: cfg }, { data: logData }] = await Promise.all([
      supabase.from('integracao_configuracao').select('*').limit(1).single(),
      supabase.from('integracao_logs').select('*').order('executado_em', { ascending: false }).limit(20),
    ]);
    setConfig(cfg as any);
    setLogs((logData || []) as any);
    setLoading(false);
    fetchDiagnostics();
  };

  const fetchDiagnostics = async () => {
    // Count by status_api
    const { data: allPedidos } = await supabase.from('pedidos').select('status_api, status_atual');
    if (!allPedidos) return;

    const apiCounts: Record<string, number> = {};
    const mismatchStatuses: Record<string, number> = {};
    let mismatchTotal = 0;

    for (const p of allPedidos) {
      const key = p.status_api || '(vazio)';
      apiCounts[key] = (apiCounts[key] || 0) + 1;

      if (p.status_api === 'Finalizado' && p.status_atual !== 'ENTREGUE' && p.status_atual !== 'CANCELADO' && p.status_atual !== 'FINALIZADO_SIMPLIFICA') {
        mismatchTotal++;
        mismatchStatuses[p.status_atual] = (mismatchStatuses[p.status_atual] || 0) + 1;
      }
    }

    setDiagCounts(Object.entries(apiCounts).map(([status_api, count]) => ({ status_api, count })).sort((a, b) => b.count - a.count));
    setMismatch({
      total: mismatchTotal,
      statuses: Object.entries(mismatchStatuses).map(([status_atual, count]) => ({ status_atual, count })).sort((a, b) => b.count - a.count),
    });
  };

  const handleFixFinalized = async () => {
    setFixing(true);
    try {
      const { data: toFix } = await supabase
        .from('pedidos')
        .select('id, status_atual')
        .eq('status_api', 'Finalizado')
        .not('status_atual', 'in', '("ENTREGUE","CANCELADO","FINALIZADO_SIMPLIFICA")');

      if (!toFix || toFix.length === 0) {
        toast.info('Nenhum pedido para corrigir.');
        setFixing(false);
        return;
      }

      let corrected = 0;
      for (const p of toFix) {
        const { error } = await supabase.from('pedidos').update({ status_atual: 'FINALIZADO_SIMPLIFICA' as any }).eq('id', p.id);
        if (!error) {
          await supabase.from('pedido_historico').insert({
            pedido_id: p.id,
            tipo_acao: 'TRANSICAO' as any,
            status_anterior: p.status_atual,
            status_novo: 'FINALIZADO_SIMPLIFICA',
            observacao: 'Corrigido automaticamente — já estava Finalizado no Simplifica na importação',
          });
          corrected++;
        }
      }

      toast.success(`${corrected} pedidos corrigidos para FINALIZADO_SIMPLIFICA.`);
      fetchDiagnostics();
    } catch (err: any) {
      toast.error(`Erro ao corrigir: ${err.message}`);
    }
    setFixing(false);
  };

  const classifyProduct = (name: string): string => {
    const upper = (name || '').toUpperCase();
    if (upper.includes('CINTO SINTETICO') || upper.includes('TIRA SINTETICO')) return 'SINTETICO';
    if (upper.includes('CINTO TECIDO') || upper.includes('TIRA TECIDO')) return 'TECIDO';
    if (upper.includes('FIVELA COBERTA')) return 'FIVELA_COBERTA';
    return 'OUTROS';
  };

  const handleReclassify = async () => {
    setReclassifying(true);
    try {
      // Get all pipelines
      const { data: pipelines } = await supabase.from('pipeline_producao').select('id, nome');
      if (!pipelines) throw new Error('Pipelines não encontrados');

      const pipelineMap: Record<string, string> = {};
      for (const p of pipelines) {
        const upper = p.nome.toUpperCase();
        if (upper.includes('SINTÉTICO') || upper.includes('SINTETICO')) pipelineMap['SINTETICO'] = p.id;
        else if (upper.includes('TECIDO')) pipelineMap['TECIDO'] = p.id;
        else if (upper.includes('FIVELA')) pipelineMap['FIVELA_COBERTA'] = p.id;
      }

      // Get all ordens with their pedido items
      const { data: ordens } = await supabase
        .from('ordens_producao')
        .select('id, pedido_id, pipeline_id, tipo_produto, status')
        .in('status', ['AGUARDANDO', 'EM_ANDAMENTO']);

      if (!ordens || ordens.length === 0) {
        toast.info('Nenhuma ordem ativa para reclassificar.');
        setReclassifying(false);
        return;
      }

      let updated = 0;
      let created = 0;

      // Group ordens by pedido_id
      const ordensByPedido = new Map<string, typeof ordens>();
      for (const o of ordens) {
        const list = ordensByPedido.get(o.pedido_id) || [];
        list.push(o);
        ordensByPedido.set(o.pedido_id, list);
      }

      for (const [pedidoId, pedidoOrdens] of ordensByPedido) {
        const { data: itens } = await supabase
          .from('pedido_itens')
          .select('descricao_produto')
          .eq('pedido_id', pedidoId);

        if (!itens || itens.length === 0) continue;

        // Detect types present
        const tiposPresentes = new Set<string>();
        for (const item of itens) {
          tiposPresentes.add(classifyProduct(item.descricao_produto));
        }
        tiposPresentes.delete('OUTROS');

        if (tiposPresentes.size === 0) continue;

        const tipos = Array.from(tiposPresentes);

        // Update first ordem with first type
        const firstOrdem = pedidoOrdens[0];
        const firstTipo = tipos[0];
        const firstPipelineId = pipelineMap[firstTipo];
        if (firstPipelineId && firstOrdem.pipeline_id !== firstPipelineId) {
          await supabase.from('ordens_producao').update({
            pipeline_id: firstPipelineId,
            tipo_produto: firstTipo,
          }).eq('id', firstOrdem.id);

          // Recreate etapas for new pipeline
          await supabase.from('op_etapas').delete().eq('ordem_id', firstOrdem.id);
          const { data: etapas } = await supabase
            .from('pipeline_etapas')
            .select('*')
            .eq('pipeline_id', firstPipelineId)
            .order('ordem');
          if (etapas && etapas.length > 0) {
            await supabase.from('op_etapas').insert(
              etapas.map((e, idx) => ({
                ordem_id: firstOrdem.id,
                pipeline_etapa_id: e.id,
                nome_etapa: e.nome,
                ordem_sequencia: e.ordem,
                status: (idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE') as any,
                ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
              }))
            );
          }
          updated++;
        }

        // Create additional ordens for additional types
        for (let i = 1; i < tipos.length; i++) {
          const tipo = tipos[i];
          const pid = pipelineMap[tipo];
          if (!pid) continue;

          // Check if already exists
          const exists = pedidoOrdens.some(o => o.tipo_produto === tipo);
          if (exists) continue;

          const { data: newOrdem } = await supabase.from('ordens_producao').insert({
            pedido_id: pedidoId,
            pipeline_id: pid,
            sequencia: pedidoOrdens.length + i,
            status: 'EM_ANDAMENTO' as any,
            tipo_produto: tipo,
          }).select().single();

          if (newOrdem) {
            const { data: etapas } = await supabase
              .from('pipeline_etapas')
              .select('*')
              .eq('pipeline_id', pid)
              .order('ordem');
            if (etapas && etapas.length > 0) {
              await supabase.from('op_etapas').insert(
                etapas.map((e, idx) => ({
                  ordem_id: newOrdem.id,
                  pipeline_etapa_id: e.id,
                  nome_etapa: e.nome,
                  ordem_sequencia: e.ordem,
                  status: (idx === 0 ? 'EM_ANDAMENTO' : 'PENDENTE') as any,
                  ...(idx === 0 ? { iniciado_em: new Date().toISOString() } : {}),
                }))
              );
            }
            created++;
          }
        }
      }

      toast.success(`Reclassificação concluída: ${updated} atualizadas, ${created} novas ordens criadas.`);
      fetchDiagnostics();
    } catch (err: any) {
      toast.error(`Erro na reclassificação: ${err.message}`);
    }
    setReclassifying(false);
  };

  if (!profile || profile.perfil !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress('Conectando à API Simplifica...');
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/sync-simplifica`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || anonKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({ tipo: 'MANUAL' }),
        }
      );

      const result = await res.json();
      if (result.success) {
        toast.success(`Sincronização concluída: ${result.total_inseridos} novos, ${result.total_atualizados} atualizados.`);
      } else {
        toast.error(`Erro na sincronização: ${result.error || 'Erro desconhecido'}`);
      }
    } catch (err: any) {
      toast.error(`Falha na sincronização: ${err.message}`);
    }
    setSyncing(false);
    setSyncProgress(null);
    fetchData();
  };

  const handleToggleAuto = async (checked: boolean) => {
    if (!config) return;
    await supabase.from('integracao_configuracao').update({ ativa: checked }).eq('id', config.id);
    setConfig({ ...config, ativa: checked });
    toast.success(checked ? 'Sincronização automática ativada.' : 'Sincronização automática desativada.');
  };

  const handleChangeInterval = async (value: string) => {
    if (!config) return;
    const mins = parseInt(value);
    await supabase.from('integracao_configuracao').update({ intervalo_minutos: mins }).eq('id', config.id);
    setConfig({ ...config, intervalo_minutos: mins });
    toast.success(`Intervalo atualizado para ${mins} minutos.`);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'SUCESSO': return <Badge className="bg-emerald-500/15 text-emerald-600 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Sucesso</Badge>;
      case 'ERRO': return <Badge className="bg-destructive/15 text-destructive border-0"><XCircle className="h-3 w-3 mr-1" />Erro</Badge>;
      case 'PARCIAL': return <Badge className="bg-amber-500/15 text-amber-600 border-0"><AlertTriangle className="h-3 w-3 mr-1" />Parcial</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="animate-fade-in space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integração Simplifica</h1>
        <p className="text-muted-foreground mt-0.5">Sincronize pedidos da API Simplifica para o sistema interno.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Manual sync */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Sincronização Manual
            </CardTitle>
            <CardDescription>Execute a importação de pedidos sob demanda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleSync} disabled={syncing} className="w-full">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
            </Button>
            {syncProgress && (
              <p className="text-sm text-muted-foreground animate-pulse">{syncProgress}</p>
            )}
            {config?.ultima_sincronizacao && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Última sync: {format(new Date(config.ultima_sincronizacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auto sync config */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-4 w-4" /> Sincronização Automática
            </CardTitle>
            <CardDescription>Configure a importação periódica.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-sync">Ativar sincronização automática</Label>
              <Switch
                id="auto-sync"
                checked={config?.ativa || false}
                onCheckedChange={handleToggleAuto}
              />
            </div>
            <div className="space-y-2">
              <Label>Intervalo</Label>
              <Select
                value={String(config?.intervalo_minutos || 15)}
                onValueChange={handleChangeInterval}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">A cada 10 minutos</SelectItem>
                  <SelectItem value="15">A cada 15 minutos</SelectItem>
                  <SelectItem value="30">A cada 30 minutos</SelectItem>
                  <SelectItem value="60">A cada 60 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config?.ativa && config?.ultima_sincronizacao && (
              <p className="text-xs text-muted-foreground">
                Próxima sync prevista: {format(
                  new Date(new Date(config.ultima_sincronizacao).getTime() + (config.intervalo_minutos * 60000)),
                  "dd/MM 'às' HH:mm", { locale: ptBR }
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diagnostics */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Diagnóstico da Base Importada
          </CardTitle>
          <CardDescription>Contagem de pedidos agrupados por status da API Simplifica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Count by status_api */}
          <div>
            <h4 className="text-sm font-medium mb-2">Pedidos por status_api</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status API</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagCounts.map(row => (
                  <TableRow key={row.status_api}>
                    <TableCell>{row.status_api}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.count}</TableCell>
                  </TableRow>
                ))}
                {diagCounts.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">Nenhum pedido importado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mismatch: Finalizado but still active */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-1">Pedidos "Finalizado" no Simplifica ainda ativos internamente</h4>
            <p className="text-xs text-muted-foreground mb-3">Pedidos com status_api = Finalizado cujo status_atual não é ENTREGUE, CANCELADO ou FINALIZADO_SIMPLIFICA.</p>
            {mismatch.total === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Nenhuma inconsistência encontrada.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">{mismatch.total} pedidos inconsistentes</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status Atual (interno)</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mismatch.statuses.map(s => (
                      <TableRow key={s.status_atual}>
                        <TableCell><Badge variant="outline">{s.status_atual}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{s.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button onClick={handleFixFinalized} disabled={fixing} variant="destructive" size="sm">
                  {fixing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  {fixing ? 'Corrigindo...' : `Corrigir ${mismatch.total} pedidos finalizados`}
                </Button>
              </div>
            )}

            {/* Reclassify button */}
            <div className="pt-4 border-t border-border/60">
              <h4 className="text-sm font-medium mb-2">Reclassificação de Pipelines</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Analisa os itens de cada pedido e migra as ordens ativas para o pipeline correto (Sintético, Tecido ou Fivela Coberta).
              </p>
              <Button onClick={handleReclassify} disabled={reclassifying} variant="outline" size="sm">
                {reclassifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Layers className="h-4 w-4 mr-2" />}
                {reclassifying ? 'Reclassificando...' : 'Reclassificar ordens por tipo de produto'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Log de Sincronizações</CardTitle>
          <CardDescription>Últimas 20 execuções.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma sincronização realizada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Recebidos</TableHead>
                  <TableHead className="text-right">Inseridos</TableHead>
                  <TableHead className="text-right">Atualizados</TableHead>
                  <TableHead className="text-right">Ignorados</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow
                    key={log.id}
                    className={
                      log.status === 'ERRO' ? 'bg-destructive/5' :
                      log.status === 'PARCIAL' ? 'bg-amber-500/5' :
                      log.status === 'SUCESSO' ? 'bg-emerald-500/5' : ''
                    }
                  >
                    <TableCell className="text-sm">
                      {format(new Date(log.executado_em), 'dd/MM/yy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{log.tipo}</Badge>
                    </TableCell>
                    <TableCell>{statusBadge(log.status)}</TableCell>
                    <TableCell className="text-right tabular-nums">{log.total_recebidos}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{log.total_inseridos}</TableCell>
                    <TableCell className="text-right tabular-nums">{log.total_atualizados}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{log.total_ignorados || 0}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {log.total_erros > 0 ? (
                        <span className="text-destructive font-medium">{log.total_erros}</span>
                      ) : '0'}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {log.duracao_ms > 1000 ? `${(log.duracao_ms / 1000).toFixed(1)}s` : `${log.duracao_ms}ms`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
