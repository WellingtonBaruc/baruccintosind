import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Scissors, AlertTriangle } from 'lucide-react';
import { agruparParaCorte, CutGroupItem, STATUS_PRAZO_CONFIG, TIPO_PRODUTO_LABELS } from '@/lib/pcp';

const PERFIS_PCP = ['supervisor_producao', 'gestor', 'admin'];

export default function PCP() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cutGroups, setCutGroups] = useState<ReturnType<typeof agruparParaCorte>>([]);
  const [leadTimeStats, setLeadTimeStats] = useState<{ atrasados: number; atencao: number; noPrazo: number }>({ atrasados: 0, atencao: 0, noPrazo: 0 });
  const [filterLargura, setFilterLargura] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Get all SINTETICO orders that have a Corte step in EM_ANDAMENTO or PENDENTE
    const { data: ordens } = await supabase
      .from('ordens_producao')
      .select('id, pedido_id, tipo_produto, pedidos!inner(numero_pedido, cliente_nome, status_prazo, status_atual)')
      .eq('tipo_produto', 'SINTETICO')
      .in('status', ['EM_ANDAMENTO', 'AGUARDANDO'])
      .eq('pedidos.status_atual', 'EM_PRODUCAO');

    if (!ordens || ordens.length === 0) {
      setLoading(false);
      return;
    }

    // Get etapas de Corte pendentes ou em andamento
    const ordemIds = ordens.map(o => o.id);
    const { data: etapasCorte } = await supabase
      .from('op_etapas')
      .select('id, ordem_id')
      .in('ordem_id', ordemIds)
      .eq('nome_etapa', 'Corte')
      .in('status', ['EM_ANDAMENTO', 'PENDENTE']);

    if (!etapasCorte || etapasCorte.length === 0) {
      setLoading(false);
      return;
    }

    const pedidoIds = [...new Set(ordens.map(o => o.pedido_id))];
    const { data: itens } = await supabase
      .from('pedido_itens')
      .select('id, pedido_id, descricao_produto, referencia_produto, observacao_producao, quantidade')
      .in('pedido_id', pedidoIds);

    // Filter only SINTETICO items
    const sinteticoItens: CutGroupItem[] = (itens || [])
      .filter(i => {
        const upper = (i.descricao_produto || '').toUpperCase();
        return upper.includes('CINTO SINTETICO') || upper.includes('TIRA SINTETICO') || upper.includes('CINTO SINTÉTICO') || upper.includes('TIRA SINTÉTICO');
      })
      .map(i => ({
        id: i.id,
        descricao: i.descricao_produto,
        referencia: i.referencia_produto,
        observacao_producao: i.observacao_producao,
        quantidade: i.quantidade,
      }));

    setCutGroups(agruparParaCorte(sinteticoItens));

    // Lead time stats
    const [r1, r2, r3] = await Promise.all([
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'ATRASADO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'ATENCAO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'NO_PRAZO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
    ]);
    setLeadTimeStats({ atrasados: r1.count || 0, atencao: r2.count || 0, noPrazo: r3.count || 0 });

    setLoading(false);
  };

  if (!profile || !PERFIS_PCP.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const larguras = [...new Set(cutGroups.map(g => g.largura))].sort();
  const filteredGroups = filterLargura === 'all' ? cutGroups : cutGroups.filter(g => g.largura === filterLargura);
  const totalPecas = filteredGroups.reduce((sum, g) => sum + g.quantidadeTotal, 0);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PCP — Planejamento de Produção</h1>
        <p className="text-muted-foreground mt-0.5">Visão consolidada para planejamento de corte e controle de prazos.</p>
      </div>

      {/* Lead time overview */}
      <div className="grid gap-3 grid-cols-3">
        <Card className="border-destructive/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.atrasados}</p>
            <p className="text-xs text-muted-foreground">Atrasados</p>
          </CardContent>
        </Card>
        <Card className="border-warning/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.atencao}</p>
            <p className="text-xs text-muted-foreground">Atenção</p>
          </CardContent>
        </Card>
        <Card className="border-[hsl(var(--success))]/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <Scissors className="h-5 w-5 text-[hsl(var(--success))]" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.noPrazo}</p>
            <p className="text-xs text-muted-foreground">No Prazo</p>
          </CardContent>
        </Card>
      </div>

      {/* Cut grouping */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="h-4 w-4" />
              Agrupamento de Corte — Sintéticos
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{filteredGroups.length} grupos • {totalPecas} peças total</p>
          </div>
          <Select value={filterLargura} onValueChange={setFilterLargura}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Largura" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {larguras.map(l => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Nenhum item pendente de corte.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Largura</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead className="text-right">Qtd Total</TableHead>
                  <TableHead>Itens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{group.largura}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{group.material}</TableCell>
                    <TableCell className="text-sm">{group.tamanho}</TableCell>
                    <TableCell className="text-sm">{group.cor}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{group.quantidadeTotal}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {group.itens.map(item => (
                          <div key={item.id} className="text-xs">
                            <span className="text-muted-foreground">{item.descricao}</span>
                            <span className="ml-2 font-medium">×{item.quantidade}</span>
                            {item.referencia && <span className="ml-1 text-muted-foreground/70">({item.referencia})</span>}
                            {item.observacao_producao && (
                              <div className="mt-0.5 bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5 text-warning text-[10px]">
                                {item.observacao_producao}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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
