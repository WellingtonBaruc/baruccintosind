import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE, STATUS_PRAZO_CONFIG } from '@/lib/pcp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, X, Play, Users, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrdemItem {
  id: string;
  pedido_id: string;
  tipo_produto: string | null;
  status: string;
  programado_para_hoje: boolean;
  pedidos: {
    numero_pedido: string;
    cliente_nome: string;
    data_previsao_entrega: string | null;
    status_prazo: string | null;
    status_atual: string;
  };
  pipeline_producao: { nome: string };
  quantidade_itens?: number;
  etapa_atual?: string;
  operador_atual?: string;
  etapa_seq?: number;
  total_etapas?: number;
}

export default function DashboardSupervisor() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ordens, setOrdens] = useState<OrdemItem[]>([]);
  const [operadores, setOperadores] = useState<{ id: string; nome: string }[]>([]);
  const [assigningOrdem, setAssigningOrdem] = useState<string | null>(null);
  const [selectedOperador, setSelectedOperador] = useState('');

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('ordens_producao')
      .select(`
        id, pedido_id, tipo_produto, status, programado_para_hoje,
        pedidos!inner(numero_pedido, cliente_nome, data_previsao_entrega, status_prazo, status_atual),
        pipeline_producao(nome)
      `)
      .neq('pedidos.status_api', 'Finalizado')
      .in('pedidos.status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO'])
      .in('status', ['AGUARDANDO', 'EM_ANDAMENTO']);

    if (data) {
      const pedidoIds = [...new Set(data.map((o: any) => o.pedido_id))];
      const { data: itens } = await supabase
        .from('pedido_itens')
        .select('pedido_id, quantidade, categoria_produto, descricao_produto')
        .in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']);

      const qtdMap: Record<string, number> = {};
      for (const item of (itens || [])) {
        const cat = (item.categoria_produto || '').toUpperCase();
        const desc = (item.descricao_produto || '').toUpperCase();
        if (cat === 'ADICIONAIS' || desc.includes('ADICIONAL')) continue;
        qtdMap[item.pedido_id] = (qtdMap[item.pedido_id] || 0) + item.quantidade;
      }

      // Fetch etapa info for programados
      const enriched = await Promise.all(data.map(async (o: any) => {
        let etapa_atual = '—', operador_atual = '—', etapa_seq = 0, total_etapas = 0;
        if (o.status === 'EM_ANDAMENTO') {
          const { data: etapas } = await supabase
            .from('op_etapas')
            .select('nome_etapa, ordem_sequencia, status, operador_id, usuarios(nome)')
            .eq('ordem_id', o.id)
            .order('ordem_sequencia');
          if (etapas) {
            total_etapas = etapas.length;
            const active = etapas.find((e: any) => e.status === 'EM_ANDAMENTO');
            if (active) {
              etapa_atual = active.nome_etapa;
              etapa_seq = active.ordem_sequencia;
              operador_atual = (active.usuarios as any)?.nome || '—';
            }
          }
        }
        return { ...o, quantidade_itens: qtdMap[o.pedido_id] || 0, etapa_atual, operador_atual, etapa_seq, total_etapas };
      }));

      setOrdens(enriched);
    }

    const { data: ops } = await supabase
      .from('usuarios')
      .select('id, nome')
      .eq('perfil', 'operador_producao')
      .eq('ativo', true);
    setOperadores(ops || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filaDisponivel = ordens
    .filter(o => !o.programado_para_hoje && o.pedidos.status_atual === 'AGUARDANDO_PRODUCAO')
    .sort((a, b) => {
      const da = a.pedidos.data_previsao_entrega || '9999-12-31';
      const db = b.pedidos.data_previsao_entrega || '9999-12-31';
      return da.localeCompare(db);
    });

  const programados = ordens.filter(o => o.programado_para_hoje || o.pedidos.status_atual === 'EM_PRODUCAO');

  // Resumo
  const resumoTipos: Record<string, number> = {};
  for (const o of programados) {
    const t = o.tipo_produto || 'OUTROS';
    resumoTipos[t] = (resumoTipos[t] || 0) + (o.quantidade_itens || 0);
  }

  const dataEntregaColor = (dateStr: string | null) => {
    if (!dateStr) return 'text-muted-foreground';
    const d = parseISO(dateStr);
    if (isPast(d) && !isToday(d)) return 'text-destructive font-semibold';
    if (isToday(d) || isTomorrow(d)) return 'text-yellow-600 font-semibold';
    return 'text-green-600';
  };

  const handleAdicionarAoDia = async (ordemId: string) => {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('ordens_producao').update({ programado_para_hoje: true, data_programacao: today } as any).eq('id', ordemId);
    toast.success('Adicionado à programação');
    fetchData();
  };

  const handleIniciarProducao = async (ordem: OrdemItem) => {
    await supabase.from('pedidos').update({ status_atual: 'EM_PRODUCAO' } as any).eq('id', ordem.pedido_id);
    await supabase.from('ordens_producao').update({ status: 'EM_ANDAMENTO' } as any).eq('id', ordem.id);
    const { data: etapas } = await supabase
      .from('op_etapas').select('id').eq('ordem_id', ordem.id).eq('status', 'PENDENTE').order('ordem_sequencia').limit(1);
    if (etapas?.[0]) {
      await supabase.from('op_etapas').update({ status: 'EM_ANDAMENTO', iniciado_em: new Date().toISOString() } as any).eq('id', etapas[0].id);
    }
    await supabase.from('pedido_historico').insert({
      pedido_id: ordem.pedido_id, usuario_id: profile!.id, tipo_acao: 'TRANSICAO',
      status_anterior: 'AGUARDANDO_PRODUCAO', status_novo: 'EM_PRODUCAO', observacao: 'Produção iniciada pelo supervisor',
    });
    toast.success('Produção iniciada!');
    fetchData();
  };

  const handleAtribuirOperador = async (ordemId: string) => {
    if (!selectedOperador) return;
    const { data: etapas } = await supabase
      .from('op_etapas').select('id').eq('ordem_id', ordemId).in('status', ['EM_ANDAMENTO', 'PENDENTE']).order('ordem_sequencia').limit(1);
    if (etapas?.[0]) {
      await supabase.from('op_etapas').update({ operador_id: selectedOperador } as any).eq('id', etapas[0].id);
    }
    toast.success('Operador atribuído');
    setAssigningOrdem(null);
    setSelectedOperador('');
    fetchData();
  };

  const handleAvancarEtapa = async (ordem: OrdemItem) => {
    const { data: etapas } = await supabase
      .from('op_etapas').select('id, status, ordem_sequencia').eq('ordem_id', ordem.id).order('ordem_sequencia');
    if (!etapas) return;
    const active = etapas.find(e => e.status === 'EM_ANDAMENTO');
    if (!active) return;
    await supabase.from('op_etapas').update({ status: 'CONCLUIDA', concluido_em: new Date().toISOString() } as any).eq('id', active.id);
    const nextIdx = etapas.findIndex(e => e.id === active.id) + 1;
    if (nextIdx < etapas.length) {
      await supabase.from('op_etapas').update({ status: 'EM_ANDAMENTO', iniciado_em: new Date().toISOString() } as any).eq('id', etapas[nextIdx].id);
    } else {
      await supabase.from('ordens_producao').update({ status: 'CONCLUIDA' } as any).eq('id', ordem.id);
    }
    await supabase.from('pedido_historico').insert({
      pedido_id: ordem.pedido_id, usuario_id: profile!.id, tipo_acao: 'TRANSICAO', observacao: 'Etapa avançada pelo supervisor',
    });
    toast.success('Etapa avançada!');
    fetchData();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Painel do Supervisor</h1>
        <p className="text-muted-foreground mt-0.5">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
      </div>

      {/* Resumo */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Resumo do dia</p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(resumoTipos).map(([tipo, qtd]) => (
              <div key={tipo} className="flex items-center gap-2">
                <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[tipo] || 'bg-muted text-muted-foreground border-border'}`}>
                  {TIPO_PRODUTO_LABELS[tipo] || tipo}
                </Badge>
                <span className="font-semibold text-sm">{qtd.toLocaleString('pt-BR')} un</span>
              </div>
            ))}
            {Object.keys(resumoTipos).length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido programado</p>}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Programar hoje */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Programar hoje ({filaDisponivel.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
            {filaDisponivel.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido aguardando.</p>}
            {filaDisponivel.map(o => {
              const prazoCfg = STATUS_PRAZO_CONFIG[o.pedidos.status_prazo || 'NO_PRAZO'];
              return (
                <div key={o.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="text-sm">{prazoCfg?.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{o.pedidos.numero_pedido}</span>
                      <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[o.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                        {TIPO_PRODUTO_LABELS[o.tipo_produto || ''] || 'Outro'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{o.quantidade_itens || 0} un</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{o.pedidos.cliente_nome}</p>
                    <p className={`text-xs ${dataEntregaColor(o.pedidos.data_previsao_entrega)}`}>
                      Entrega: {o.pedidos.data_previsao_entrega ? format(parseISO(o.pedidos.data_previsao_entrega), 'dd/MM') : '—'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="min-h-[48px]" onClick={() => handleAdicionarAoDia(o.id)}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Em andamento hoje */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Em andamento ({programados.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
            {programados.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido em andamento.</p>}
            {programados.map(o => (
              <div key={o.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{o.pedidos.numero_pedido}</span>
                    <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[o.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                      {TIPO_PRODUTO_LABELS[o.tipo_produto || ''] || 'Outro'}
                    </Badge>
                  </div>
                  {o.total_etapas > 0 && (
                    <span className="text-xs text-muted-foreground">Etapa {o.etapa_seq} de {o.total_etapas}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{o.pedidos.cliente_nome}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Etapa:</span>
                  <span className="font-medium">{o.etapa_atual}</span>
                  <span className="text-muted-foreground ml-2">Operador:</span>
                  <span className="font-medium">{o.operador_atual}</span>
                </div>
                {/* Progress bar */}
                {o.total_etapas > 0 && (
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${(o.etapa_seq / o.total_etapas) * 100}%` }} />
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {assigningOrdem === o.id ? (
                    <div className="flex gap-2 items-center w-full">
                      <Select value={selectedOperador} onValueChange={setSelectedOperador}>
                        <SelectTrigger className="h-10 flex-1"><SelectValue placeholder="Operador..." /></SelectTrigger>
                        <SelectContent>
                          {operadores.map(op => <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="min-h-[40px]" onClick={() => handleAtribuirOperador(o.id)} disabled={!selectedOperador}>OK</Button>
                      <Button size="sm" variant="ghost" className="min-h-[40px]" onClick={() => setAssigningOrdem(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="min-h-[48px] text-xs" onClick={() => { setAssigningOrdem(o.id); setSelectedOperador(''); }}>
                        <Users className="h-3.5 w-3.5 mr-1" /> Atribuir
                      </Button>
                      {o.pedidos.status_atual === 'AGUARDANDO_PRODUCAO' ? (
                        <Button size="sm" className="min-h-[48px] text-xs" onClick={() => handleIniciarProducao(o)}>
                          <Play className="h-3.5 w-3.5 mr-1" /> Iniciar
                        </Button>
                      ) : o.etapa_atual !== '—' && (
                        <Button size="sm" variant="secondary" className="min-h-[48px] text-xs" onClick={() => handleAvancarEtapa(o)}>
                          <ChevronRight className="h-3.5 w-3.5 mr-1" /> Avançar etapa
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
