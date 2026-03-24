import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_ORDEM_CONFIG } from '@/lib/producao';
import { STATUS_PRAZO_CONFIG, TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE, classificarProduto } from '@/lib/pcp';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Search, Clock, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const PERFIS_PRODUCAO = ['operador_producao', 'supervisor_producao', 'gestor', 'admin'];

interface EtapaInfo {
  id: string;
  nome_etapa: string;
  ordem_sequencia: number;
  status: string;
}

interface OrdemView {
  id: string;
  pedido_id: string;
  pipeline_id: string;
  sequencia: number;
  status: string;
  tipo_produto: string | null;
  criado_em: string;
  pedidos: { numero_pedido: string; cliente_nome: string; valor_liquido: number; criado_em: string; status_prazo: string | null; data_previsao_entrega: string | null; api_venda_id: string | null; status_api: string | null };
  pipeline_producao: { nome: string };
  etapa_atual?: string;
  operador_atual?: string;
  etapas?: EtapaInfo[];
}

interface UnitCounters {
  SINTETICO: number;
  TECIDO: number;
  FIVELA_COBERTA: number;
  OUTROS: number;
}

export default function FilaProducao() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [ordens, setOrdens] = useState<OrdemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('urgencia');
  const [unitCounters, setUnitCounters] = useState<UnitCounters>({ SINTETICO: 0, TECIDO: 0, FIVELA_COBERTA: 0, OUTROS: 0 });

  useEffect(() => {
    fetchOrdens();
    fetchUnitCounters();
  }, []);

  const fetchOrdens = async () => {
    const { data } = await supabase
      .from('ordens_producao')
      .select(`
        *,
        pedidos!inner(numero_pedido, cliente_nome, valor_liquido, criado_em, status_prazo, data_previsao_entrega, api_venda_id, status_api),
        pipeline_producao(nome)
      `)
      .neq('pedidos.status_api', 'Finalizado')
      .order('criado_em', { ascending: false });

    if (data) {
      const ordemIds = data.map((o: any) => o.id);
      
      // Fetch all etapas for all ordens in one query
      const { data: allEtapas } = await supabase
        .from('op_etapas')
        .select('id, ordem_id, nome_etapa, ordem_sequencia, status, operador_id, usuarios(nome)')
        .in('ordem_id', ordemIds)
        .order('ordem_sequencia', { ascending: true });

      const etapasMap = new Map<string, any[]>();
      if (allEtapas) {
        for (const e of allEtapas) {
          const list = etapasMap.get(e.ordem_id) || [];
          list.push(e);
          etapasMap.set(e.ordem_id, list);
        }
      }

      const ordensWithEtapa = data.map((o: any) => {
        const etapas = etapasMap.get(o.id) || [];
        const emAndamento = etapas.find((e: any) => e.status === 'EM_ANDAMENTO');
        return {
          ...o,
          etapa_atual: emAndamento?.nome_etapa || (o.status === 'CONCLUIDA' ? 'Concluído' : '—'),
          operador_atual: emAndamento ? ((emAndamento.usuarios as any)?.nome || '—') : '—',
          etapas: etapas.map((e: any) => ({ id: e.id, nome_etapa: e.nome_etapa, ordem_sequencia: e.ordem_sequencia, status: e.status })),
        };
      });
      setOrdens(ordensWithEtapa);
    }
    setLoading(false);
  };

  const fetchUnitCounters = async () => {
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id')
      .eq('status_api', 'Em Produção');

    if (!pedidos || pedidos.length === 0) return;

    const pedidoIds = pedidos.map(p => p.id);
    const { data: itens } = await supabase
      .from('pedido_itens')
      .select('descricao_produto, quantidade, categoria_produto')
      .in('pedido_id', pedidoIds);

    if (!itens) return;

    const counters: UnitCounters = { SINTETICO: 0, TECIDO: 0, FIVELA_COBERTA: 0, OUTROS: 0 };
    for (const item of itens) {
      const cat = (item.categoria_produto || '').toUpperCase();
      const desc = (item.descricao_produto || '').toUpperCase();
      if (cat === 'ADICIONAIS' || desc.includes('ADICIONAL')) continue;
      const tipo = classificarProduto(item.descricao_produto);
      if (tipo in counters) {
        counters[tipo as keyof UnitCounters] += item.quantidade;
      } else {
        counters.OUTROS += item.quantidade;
      }
    }
    setUnitCounters(counters);
  };

  // Admin move order to a specific etapa
  const handleMoveToEtapa = async (ordem: OrdemView, targetEtapa: EtapaInfo) => {
    if (!profile || !['admin', 'gestor'].includes(profile.perfil)) return;
    
    const etapas = ordem.etapas || [];
    
    // Update all etapas: before target = CONCLUIDA, target = EM_ANDAMENTO, after = PENDENTE
    for (const etapa of etapas) {
      let newStatus: string;
      if (etapa.ordem_sequencia < targetEtapa.ordem_sequencia) {
        newStatus = 'CONCLUIDA';
      } else if (etapa.ordem_sequencia === targetEtapa.ordem_sequencia) {
        newStatus = 'EM_ANDAMENTO';
      } else {
        newStatus = 'PENDENTE';
      }
      if (etapa.status !== newStatus) {
        await supabase.from('op_etapas').update({ 
          status: newStatus,
          ...(newStatus === 'EM_ANDAMENTO' ? { iniciado_em: new Date().toISOString() } : {}),
          ...(newStatus === 'CONCLUIDA' ? { concluido_em: new Date().toISOString() } : {}),
        } as any).eq('id', etapa.id);
      }
    }

    // Update ordem status
    const ordemStatus = targetEtapa.ordem_sequencia === 0 ? 'AGUARDANDO' : 'EM_ANDAMENTO';
    await supabase.from('ordens_producao').update({ status: ordemStatus } as any).eq('id', ordem.id);

    toast.success(`Ordem movida para: ${targetEtapa.nome_etapa}`);
    fetchOrdens();
  };

  if (!profile || !PERFIS_PRODUCAO.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const filtered = ordens.filter(o => {
    const matchSearch = search === '' ||
      o.pedidos.numero_pedido.toLowerCase().includes(search.toLowerCase()) ||
      o.pedidos.cliente_nome.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'urgencia') {
      const prazoOrder: Record<string, number> = { ATRASADO: 0, ATENCAO: 1, NO_PRAZO: 2 };
      const pa = prazoOrder[a.pedidos.status_prazo || 'NO_PRAZO'] ?? 3;
      const pb = prazoOrder[b.pedidos.status_prazo || 'NO_PRAZO'] ?? 3;
      if (pa !== pb) return pa - pb;
    }
    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
  });

  const emProducaoCount = filtered.filter(o => o.pedidos.status_api === 'Em Produção').length;
  const pedidoEnviadoCount = filtered.filter(o => o.pedidos.status_api === 'Pedido Enviado').length;
  const atrasadoCount = filtered.filter(o => (o.pedidos.status_prazo || 'NO_PRAZO') === 'ATRASADO').length;
  const atencaoCount = filtered.filter(o => (o.pedidos.status_prazo || 'NO_PRAZO') === 'ATENCAO').length;
  const noPrazoCount = filtered.filter(o => (o.pedidos.status_prazo || 'NO_PRAZO') === 'NO_PRAZO').length;

  const formatNum = (n: number) => n.toLocaleString('pt-BR');

  const isAdmin = profile && ['admin', 'gestor'].includes(profile.perfil);

  const getStepColor = (status: string) => {
    if (status === 'CONCLUIDA') return 'bg-green-500';
    if (status === 'EM_ANDAMENTO') return 'bg-primary';
    return 'bg-muted';
  };

  const getStepTextColor = (status: string) => {
    if (status === 'CONCLUIDA') return 'text-green-700';
    if (status === 'EM_ANDAMENTO') return 'text-primary font-semibold';
    return 'text-muted-foreground';
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fila de Produção</h1>
          <p className="text-muted-foreground mt-0.5">Ordens de produção em andamento.</p>
        </div>
        {['admin', 'gestor'].includes(profile.perfil) && (
          <Button onClick={() => navigate('/producao/novo')}>
            <Plus className="h-4 w-4 mr-1" /> Novo Pedido
          </Button>
        )}
      </div>

      {/* Summary counters */}
      {!loading && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm">
            <span className="text-2xl font-bold text-foreground">{filtered.length}</span>
            <span className="ml-1.5 text-muted-foreground">pedidos em produção</span>
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" />{emProducaoCount} Em Produção</span>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-orange-500" />{pedidoEnviadoCount} Pedido Enviado</span>
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm flex items-center gap-3">
            <span className="flex items-center gap-1">🔴 {atrasadoCount} Atrasados</span>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1">🟡 {atencaoCount} Atenção</span>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1">🟢 {noPrazoCount} No Prazo</span>
          </div>
        </div>
      )}

      {/* Unit counters by type */}
      {!loading && (unitCounters.SINTETICO > 0 || unitCounters.TECIDO > 0 || unitCounters.FIVELA_COBERTA > 0) && (
        <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm flex items-center gap-4 flex-wrap">
          <span className="text-muted-foreground font-medium">Unidades:</span>
          {unitCounters.SINTETICO > 0 && (
            <span className="flex items-center gap-1.5">
              <Badge className="bg-purple-500/15 text-purple-700 border-purple-200 font-normal text-xs">Sintético</Badge>
              <span className="font-semibold">{formatNum(unitCounters.SINTETICO)} un</span>
            </span>
          )}
          {unitCounters.TECIDO > 0 && (
            <span className="flex items-center gap-1.5">
              <Badge className="bg-orange-500/15 text-orange-700 border-orange-200 font-normal text-xs">Tecido</Badge>
              <span className="font-semibold">{formatNum(unitCounters.TECIDO)} un</span>
            </span>
          )}
          {unitCounters.FIVELA_COBERTA > 0 && (
            <span className="flex items-center gap-1.5">
              <Badge className="bg-blue-500/15 text-blue-700 border-blue-200 font-normal text-xs">Fivela Coberta</Badge>
              <span className="font-semibold">{formatNum(unitCounters.FIVELA_COBERTA)} un</span>
            </span>
          )}
          {unitCounters.OUTROS > 0 && (
            <span className="flex items-center gap-1.5">
              <Badge className="bg-muted text-muted-foreground border-border font-normal text-xs">Outros</Badge>
              <span className="font-semibold">{formatNum(unitCounters.OUTROS)} un</span>
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pedido ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_ORDEM_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="urgencia">Mais urgentes</SelectItem>
            <SelectItem value="recente">Mais recentes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Nenhuma ordem encontrada.</p>
          ) : (
            <div className="divide-y divide-border">
              {sorted.map(o => {
                const prazoCfg = STATUS_PRAZO_CONFIG[o.pedidos.status_prazo || 'NO_PRAZO'];
                const tipoLabel = TIPO_PRODUTO_LABELS[o.tipo_produto || ''] || o.tipo_produto || '—';
                const etapas = o.etapas || [];

                return (
                  <div key={o.id} className="hover:bg-accent/20 transition-colors">
                    {/* Main row */}
                    <div
                      className="grid grid-cols-[32px_1fr_1fr_auto_1fr_auto_1fr_1fr_auto] items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => navigate(`/producao/ordem/${o.id}`)}
                    >
                      <div>
                        {prazoCfg && <span title={prazoCfg.label} className="text-sm">{prazoCfg.icon}</span>}
                      </div>
                      <div>
                        <span className="font-medium text-sm">{o.pedidos.numero_pedido}</span>
                        {o.sequencia > 1 && <Badge variant="outline" className="ml-1.5 text-[10px]">OP {o.sequencia}</Badge>}
                      </div>
                      <div className="text-muted-foreground text-sm">{o.pedidos.api_venda_id || '—'}</div>
                      <div>
                        {(() => {
                          const sa = o.pedidos.status_api;
                          if (sa === 'Em Produção') return <Badge className="bg-blue-500/15 text-blue-700 border-blue-200 font-normal text-xs">Em Produção</Badge>;
                          if (sa === 'Pedido Enviado') return <Badge className="bg-orange-500/15 text-orange-700 border-orange-200 font-normal text-xs">Pedido Enviado</Badge>;
                          if (sa === 'Finalizado') return <Badge className="bg-muted text-muted-foreground font-normal text-xs">Finalizado</Badge>;
                          return <Badge variant="outline" className="font-normal text-muted-foreground text-xs">—</Badge>;
                        })()}
                      </div>
                      <div className="text-muted-foreground text-sm truncate">{o.pedidos.cliente_nome}</div>
                      <Badge className={`text-[10px] font-normal ${TIPO_PRODUTO_BADGE[o.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                        {tipoLabel || 'A classificar'}
                      </Badge>
                      <div className="text-sm text-muted-foreground truncate">{o.pipeline_producao?.nome}</div>
                      <div className="text-sm text-muted-foreground">{o.operador_atual !== '—' ? o.operador_atual : ''}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(o.criado_em), { locale: ptBR, addSuffix: true })}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {etapas.length > 0 && (
                      <div className="px-4 pb-3 pt-0">
                        <TooltipProvider delayDuration={200}>
                          <div className="flex items-center gap-0.5">
                            {etapas.map((etapa, idx) => {
                              const isLast = idx === etapas.length - 1;
                              const isConcluida = etapa.status === 'CONCLUIDA';
                              const isEmAndamento = etapa.status === 'EM_ANDAMENTO';
                              const isPendente = etapa.status === 'PENDENTE';

                              return (
                                <Tooltip key={etapa.id}>
                                  <TooltipTrigger asChild>
                                    <button
                                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all ${
                                        isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'
                                      } ${
                                        isConcluida ? 'bg-green-100 text-green-700' :
                                        isEmAndamento ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30' :
                                        'bg-muted/60 text-muted-foreground'
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isAdmin) handleMoveToEtapa(o, etapa);
                                      }}
                                    >
                                      {isConcluida && <CheckCircle2 className="h-3 w-3" />}
                                      <span className="truncate max-w-[80px]">{etapa.nome_etapa}</span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <p className="font-medium">{etapa.nome_etapa}</p>
                                    <p className="text-muted-foreground">
                                      {isConcluida ? 'Concluída' : isEmAndamento ? 'Em Andamento' : 'Pendente'}
                                    </p>
                                    {isAdmin && <p className="text-primary mt-0.5">Clique para mover para esta etapa</p>}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}

                            {/* Concluído final step */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all ${
                                    isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'
                                  } ${
                                    o.status === 'CONCLUIDA' ? 'bg-green-100 text-green-700 font-semibold' : 'bg-muted/60 text-muted-foreground'
                                  }`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!isAdmin) return;
                                    // Mark all etapas as CONCLUIDA and ordem as CONCLUIDA
                                    for (const et of etapas) {
                                      if (et.status !== 'CONCLUIDA') {
                                        await supabase.from('op_etapas').update({ status: 'CONCLUIDA', concluido_em: new Date().toISOString() } as any).eq('id', et.id);
                                      }
                                    }
                                    await supabase.from('ordens_producao').update({ status: 'CONCLUIDA' } as any).eq('id', o.id);
                                    toast.success('Ordem marcada como Concluída');
                                    fetchOrdens();
                                  }}
                                >
                                  {o.status === 'CONCLUIDA' && <CheckCircle2 className="h-3 w-3" />}
                                  <span>Concluído</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-medium">Concluído</p>
                                {isAdmin && <p className="text-primary mt-0.5">Clique para concluir a ordem</p>}
                              </TooltipContent>
                            </Tooltip>

                            {/* Connecting lines between steps */}
                          </div>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
