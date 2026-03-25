import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Package, Clock, AlertTriangle, CheckCircle2, TrendingUp, BarChart3, Factory, FileX, CalendarIcon } from 'lucide-react';
import { format, subDays, subMonths, startOfDay, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Helper: convert UTC date to Brasília (UTC-3) for display
function toBrasilia(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(d.getTime() - 3 * 60 * 60 * 1000);
}

function formatBrasiliaDay(dateStr: string): { key: string; sortKey: string } {
  const d = toBrasilia(dateStr);
  return { key: format(d, 'dd/MM'), sortKey: format(d, 'yyyy-MM-dd') };
}
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

const PERFIS_PRODUCAO = ['admin', 'gestor', 'supervisor_producao'];

type PeriodoFilter = '7d' | '15d' | '30d' | '90d' | 'custom';
type TipoFilter = 'all' | 'SINTETICO' | 'TECIDO' | 'FIVELA_COBERTA';

interface OrdemData {
  id: string;
  pedido_id: string;
  tipo_produto: string;
  status: string;
  sequencia: number;
  criado_em: string;
  data_inicio_pcp: string | null;
  data_fim_pcp: string | null;
  programado_inicio_data: string | null;
  programado_conclusao_data: string | null;
  pedidos: {
    api_venda_id: string;
    cliente_nome: string;
    data_previsao_entrega: string | null;
    status_atual: string;
  };
}

interface EtapaData {
  id: string;
  ordem_id: string;
  nome_etapa: string;
  status: string;
  iniciado_em: string | null;
  concluido_em: string | null;
}

interface ItemData {
  pedido_id: string;
  quantidade: number;
}

interface PedidoSimplifica {
  id: string;
  atualizado_em: string;
  status_atual: string;
}

const PIE_COLORS = ['hsl(217, 91%, 60%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(280, 67%, 55%)'];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

export default function RelatoriosProducao() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ordens, setOrdens] = useState<OrdemData[]>([]);
  const [etapas, setEtapas] = useState<EtapaData[]>([]);
  const [allItems, setAllItems] = useState<ItemData[]>([]);
  const [pedidosSimplifica, setPedidosSimplifica] = useState<PedidoSimplifica[]>([]);
  const [periodo, setPeriodo] = useState<PeriodoFilter>('30d');
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('all');
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);

  const dateRange = useMemo(() => {
    const end = new Date();
    let start: Date;
    switch (periodo) {
      case '7d': start = subDays(end, 7); break;
      case '15d': start = subDays(end, 15); break;
      case '30d': start = subMonths(end, 1); break;
      case '90d': start = subMonths(end, 3); break;
      case 'custom':
        start = customStart || subMonths(end, 1);
        if (customEnd) return { start: startOfDay(start), end: new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate(), 23, 59, 59) };
        return { start: startOfDay(start), end };
      default: start = subMonths(end, 1);
    }
    return { start: startOfDay(start), end };
  }, [periodo, customStart, customEnd]);

  useEffect(() => { fetchData(); }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    const startISO = dateRange.start.toISOString();
    const endISO = dateRange.end.toISOString();

    // Fetch only completed orders: OPs CONCLUIDA by data_fim_pcp OR by criado_em within range
    // Also fetch pedidos with production concluded status
    const [ordensConcluidasFimRes, ordensConcluidasCriadoRes, etapasRes, pedidosConcluidosRes] = await Promise.all([
      supabase
        .from('ordens_producao')
        .select('id, pedido_id, tipo_produto, status, sequencia, criado_em, data_inicio_pcp, data_fim_pcp, programado_inicio_data, programado_conclusao_data, pedidos!inner(api_venda_id, cliente_nome, data_previsao_entrega, status_atual)')
        .eq('status', 'CONCLUIDA')
        .gte('data_fim_pcp', startISO)
        .lte('data_fim_pcp', endISO)
        .order('data_fim_pcp', { ascending: false }),
      supabase
        .from('ordens_producao')
        .select('id, pedido_id, tipo_produto, status, sequencia, criado_em, data_inicio_pcp, data_fim_pcp, programado_inicio_data, programado_conclusao_data, pedidos!inner(api_venda_id, cliente_nome, data_previsao_entrega, status_atual)')
        .eq('status', 'CONCLUIDA')
        .gte('criado_em', startISO)
        .lte('criado_em', endISO)
        .order('criado_em', { ascending: false }),
      supabase
        .from('op_etapas')
        .select('id, ordem_id, nome_etapa, status, iniciado_em, concluido_em')
        .gte('iniciado_em', startISO),
      supabase
        .from('pedidos')
        .select('id, atualizado_em, status_atual')
        .in('status_atual', ['PRODUCAO_CONCLUIDA', 'FINALIZADO_SIMPLIFICA'])
        .gte('atualizado_em', startISO)
        .lte('atualizado_em', endISO),
    ]);

    // Merge both OP queries, deduplicating by id
    const mergedMap = new Map<string, OrdemData>();
    (ordensConcluidasFimRes.data || []).forEach((o: any) => mergedMap.set(o.id, o));
    (ordensConcluidasCriadoRes.data || []).forEach((o: any) => mergedMap.set(o.id, o));
    const ordensData = Array.from(mergedMap.values()) as OrdemData[];
    const etapasData = (etapasRes.data || []) as unknown as EtapaData[];
    const pedidosConcluidosData = (pedidosConcluidosRes.data || []) as PedidoSimplifica[];

    const pedidoIdsComOP = new Set(ordensData.map(o => o.pedido_id));
    const simplificaSemOP = pedidosConcluidosData.filter(p => !pedidoIdsComOP.has(p.id));

    // Fetch ALL items for relevant pedidos (needed for peças count)
    const pedidoIds = [...new Set([...ordensData.map(o => o.pedido_id), ...simplificaSemOP.map(p => p.id)])];
    let itemsData: ItemData[] = [];
    if (pedidoIds.length > 0) {
      // Batch in chunks of 200 to avoid URI too long
      const chunks: string[][] = [];
      for (let i = 0; i < pedidoIds.length; i += 200) chunks.push(pedidoIds.slice(i, i + 200));
      const allItemResults = await Promise.all(
        chunks.map(chunk => supabase.from('pedido_itens').select('pedido_id, quantidade').in('pedido_id', chunk))
      );
      allItemResults.forEach(r => {
        if (r.data) itemsData.push(...(r.data as ItemData[]));
      });
    }

    setOrdens(ordensData);
    setEtapas(etapasData);
    setAllItems(itemsData);
    setPedidosSimplifica(simplificaSemOP);
    setLoading(false);
  };

  // Helper: get total peças for a pedido_id
  const getPecasByPedido = useMemo(() => {
    const map: Record<string, number> = {};
    allItems.forEach(i => {
      map[i.pedido_id] = (map[i.pedido_id] || 0) + (i.quantidade || 0);
    });
    return map;
  }, [allItems]);

  const filteredOrdens = tipoFilter === 'all' ? ordens : ordens.filter(o => o.tipo_produto === tipoFilter);

  // ========== KPI CALCULATIONS (all orders are CONCLUIDA) ==========
  const totalOPs = filteredOrdens.length;
  const opsFinalizadas = totalOPs;

  // Total PEÇAS (sum of item quantities across filtered orders)
  const totalPecas = useMemo(() => {
    const seen = new Set<string>();
    let total = 0;
    filteredOrdens.forEach(o => {
      if (!seen.has(o.pedido_id)) {
        seen.add(o.pedido_id);
        total += getPecasByPedido[o.pedido_id] || 0;
      }
    });
    return total;
  }, [filteredOrdens, getPecasByPedido]);

  // Peças Sintético / Tecido
  const pecasSintetico = useMemo(() => {
    const seen = new Set<string>();
    let total = 0;
    filteredOrdens.filter(o => o.tipo_produto === 'SINTETICO').forEach(o => {
      if (!seen.has(o.pedido_id)) {
        seen.add(o.pedido_id);
        total += getPecasByPedido[o.pedido_id] || 0;
      }
    });
    return total;
  }, [filteredOrdens, getPecasByPedido]);

  const pecasTecido = useMemo(() => {
    const seen = new Set<string>();
    let total = 0;
    filteredOrdens.filter(o => o.tipo_produto === 'TECIDO').forEach(o => {
      if (!seen.has(o.pedido_id)) {
        seen.add(o.pedido_id);
        total += getPecasByPedido[o.pedido_id] || 0;
      }
    });
    return total;
  }, [filteredOrdens, getPecasByPedido]);

  // Simplifica sem OP
  const totalSimplificaSemOP = pedidosSimplifica.length;
  const pecasSimplificaSemOP = useMemo(() => {
    return pedidosSimplifica.reduce((sum, p) => sum + (getPecasByPedido[p.id] || 0), 0);
  }, [pedidosSimplifica, getPecasByPedido]);

    // All orders are CONCLUIDA, no delayed ones in this context
  const atrasados = 0;

  // Average production time (for completed orders)
  const avgProducaoMinutes = useMemo(() => {
    const completed = filteredOrdens.filter(o => o.data_inicio_pcp && o.data_fim_pcp);
    if (completed.length === 0) return 0;
    const totalMins = completed.reduce((sum, o) => {
      return sum + differenceInMinutes(new Date(o.data_fim_pcp!), new Date(o.data_inicio_pcp!));
    }, 0);
    return totalMins / completed.length;
  }, [filteredOrdens]);

  // ========== CHART DATA ==========
  // Daily production: only OPs concluídas no Kanban de Produção, PEÇAS per day, Brasília timezone
  const dailyProductionStacked = useMemo(() => {
    const days: Record<string, { sintetico: number; tecido: number; sortKey: string }> = {};

    filteredOrdens.filter(o => o.status === 'CONCLUIDA' && o.data_fim_pcp).forEach(o => {
      const { key, sortKey } = formatBrasiliaDay(o.data_fim_pcp!);
      if (!days[key]) days[key] = { sintetico: 0, tecido: 0, sortKey };
      const pecas = getPecasByPedido[o.pedido_id] || 1;
      if (o.tipo_produto === 'TECIDO') days[key].tecido += pecas;
      else days[key].sintetico += pecas;
    });

    return Object.entries(days)
      .map(([dia, d]) => ({
        dia,
        sortKey: d.sortKey,
        sintetico: d.sintetico,
        tecido: d.tecido,
        total: d.sintetico + d.tecido,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-14);
  }, [filteredOrdens, getPecasByPedido]);

  // Production by type (pie) — PEÇAS
  const prodByType = useMemo(() => {
    const result: { name: string; value: number }[] = [];
    if (pecasSintetico > 0) result.push({ name: 'Sintético', value: pecasSintetico });
    if (pecasTecido > 0) result.push({ name: 'Tecido', value: pecasTecido });
    if (pecasSimplificaSemOP > 0) result.push({ name: 'Simplifica (sem OP)', value: pecasSimplificaSemOP });
    return result;
  }, [pecasSintetico, pecasTecido, pecasSimplificaSemOP]);

  // Time per stage (bar chart)
  const timePerStage = useMemo(() => {
    const stageMap: Record<string, { total: number; count: number }> = {};
    const relevantOrdemIds = new Set(filteredOrdens.map(o => o.id));
    etapas.filter(e => e.iniciado_em && e.concluido_em && relevantOrdemIds.has(e.ordem_id)).forEach(e => {
      const mins = differenceInMinutes(new Date(e.concluido_em!), new Date(e.iniciado_em!));
      if (mins > 0 && mins < 100000) {
        if (!stageMap[e.nome_etapa]) stageMap[e.nome_etapa] = { total: 0, count: 0 };
        stageMap[e.nome_etapa].total += mins;
        stageMap[e.nome_etapa].count++;
      }
    });
    return Object.entries(stageMap).map(([etapa, d]) => ({
      etapa,
      media_horas: Math.round((d.total / d.count / 60) * 10) / 10,
    }));
  }, [etapas, filteredOrdens]);

  // Bottleneck
  const bottleneck = useMemo(() => {
    const stageCount: Record<string, number> = {};
    const relevantOrdemIds = new Set(filteredOrdens.filter(o => o.status !== 'CONCLUIDA').map(o => o.id));
    etapas.filter(e => e.status === 'EM_ANDAMENTO' && relevantOrdemIds.has(e.ordem_id)).forEach(e => {
      stageCount[e.nome_etapa] = (stageCount[e.nome_etapa] || 0) + 1;
    });
    const sorted = Object.entries(stageCount).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { etapa: sorted[0][0], count: sorted[0][1] } : null;
  }, [etapas, filteredOrdens]);

  // ========== DETAILED TABLE ==========
  // Filter out AGUARDANDO for orders without any PCP dates (pre-system)
  const tableData = useMemo(() => {
    return filteredOrdens
      .filter(o => {
        // Remove AGUARDANDO orders that have no PCP dates (pre-system period)
        if (o.status === 'AGUARDANDO' && !o.data_inicio_pcp && !o.data_fim_pcp && !o.programado_inicio_data) {
          return false;
        }
        return true;
      })
      .map(o => {
        const durationMins = o.data_inicio_pcp && o.data_fim_pcp
          ? differenceInMinutes(new Date(o.data_fim_pcp), new Date(o.data_inicio_pcp))
          : null;
        return {
          ...o,
          quantidade: getPecasByPedido[o.pedido_id] || 0,
          duracao: durationMins,
          isOPLoja: o.sequencia > 1,
        };
      });
  }, [filteredOrdens, getPecasByPedido]);

  if (!profile || !PERFIS_PRODUCAO.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const kpiCards = [
    { label: 'Total Peças', value: totalPecas.toLocaleString('pt-BR'), icon: Package, colorClass: 'text-foreground', bgClass: 'bg-muted' },
    { label: 'Peças Sintético', value: pecasSintetico.toLocaleString('pt-BR'), icon: Package, colorClass: 'text-blue-600', bgClass: 'bg-blue-500/10' },
    { label: 'Peças Tecido', value: pecasTecido.toLocaleString('pt-BR'), icon: Package, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-500/10' },
    { label: 'Simplifica sem OP', value: `${totalSimplificaSemOP} (${pecasSimplificaSemOP} pçs)`, icon: FileX, colorClass: 'text-amber-600', bgClass: 'bg-amber-500/10' },
    { label: 'Tempo Médio', value: formatDuration(avgProducaoMinutes), icon: TrendingUp, colorClass: 'text-purple-600', bgClass: 'bg-purple-500/10' },
    { label: 'Atrasados', value: atrasados, icon: AlertTriangle, colorClass: 'text-destructive', bgClass: 'bg-destructive/10' },
  ];

  const kpiCardsSecondary = [
    { label: 'OPs Concluídas', value: opsFinalizadas, icon: CheckCircle2, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-500/10' },
    { label: 'Simplifica sem OP', value: totalSimplificaSemOP, icon: FileX, colorClass: 'text-amber-600', bgClass: 'bg-amber-500/10' },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/kanban')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Relatórios de Produção</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Análise de desempenho e indicadores operacionais.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Período</label>
          <Select value={periodo} onValueChange={v => setPeriodo(v as PeriodoFilter)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="15d">Últimos 15 dias</SelectItem>
              <SelectItem value="30d">Último mês</SelectItem>
              <SelectItem value="90d">Últimos 3 meses</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {periodo === 'custom' && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">De</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !customStart && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customStart ? format(customStart, 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customStart} onSelect={setCustomStart} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Até</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !customEnd && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customEnd ? format(customEnd, 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
          <Select value={tipoFilter} onValueChange={v => setTipoFilter(v as TipoFilter)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="SINTETICO">Sintético</SelectItem>
              <SelectItem value="TECIDO">Tecido</SelectItem>
              <SelectItem value="FIVELA_COBERTA">Fivela Coberta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* KPI Cards — Peças */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {kpiCards.map(kpi => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label} className="border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`rounded-lg p-1.5 ${kpi.bgClass}`}>
                        <Icon className={`h-3.5 w-3.5 ${kpi.colorClass}`} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums ${kpi.colorClass}`}>{kpi.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* KPI Cards — OPs (secondary) */}
          <div className="grid gap-3 grid-cols-3 max-w-lg">
            {kpiCardsSecondary.map(kpi => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label} className="border-border/60">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-3.5 w-3.5 ${kpi.colorClass}`} />
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                    </div>
                    <p className={`text-xl font-bold tabular-nums ${kpi.colorClass}`}>{kpi.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Bottleneck alert */}
          {bottleneck && (
            <Card className="border-amber-400/50 bg-amber-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Gargalo identificado</p>
                  <p className="text-xs text-amber-700">
                    A etapa <span className="font-bold">{bottleneck.etapa}</span> possui <span className="font-bold">{bottleneck.count}</span> {bottleneck.count === 1 ? 'ordem parada' : 'ordens paradas'} no momento.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Charts */}
          <Tabs defaultValue="diario" className="space-y-4">
            <TabsList>
              <TabsTrigger value="diario">Produção Diária (Peças)</TabsTrigger>
              <TabsTrigger value="tipo">Por Tipo</TabsTrigger>
              <TabsTrigger value="etapas">Tempo por Etapa</TabsTrigger>
            </TabsList>

            <TabsContent value="diario">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Peças Concluídas por Dia — Sintético / Tecido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dailyProductionStacked.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">Sem dados de conclusão no período.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={dailyProductionStacked}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="dia" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <Tooltip
                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                            formatter={(value: number, name: string) => [`${value} pçs`, name]}
                          />
                          <Legend />
                          <Bar dataKey="sintetico" name="Sintético" stackId="a" fill="hsl(217, 91%, 60%)" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="tecido" name="Tecido" stackId="a" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>

                      {/* Daily totals and percentages */}
                      <div className="overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead className="text-right">Sintético</TableHead>
                              <TableHead className="text-right">Tecido</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right">% Sint.</TableHead>
                              <TableHead className="text-right">% Tec.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailyProductionStacked.map(d => {
                              const pctSint = d.total > 0 ? Math.round((d.sintetico / d.total) * 100) : 0;
                              const pctTec = d.total > 0 ? Math.round((d.tecido / d.total) * 100) : 0;
                              return (
                                <TableRow key={d.dia}>
                                  <TableCell className="font-medium">{d.dia}</TableCell>
                                  <TableCell className="text-right tabular-nums">{d.sintetico}</TableCell>
                                  <TableCell className="text-right tabular-nums">{d.tecido}</TableCell>
                                  <TableCell className="text-right font-bold tabular-nums">{d.total}</TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">{pctSint}%</TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">{pctTec}%</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tipo">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Distribuição por Tipo (Peças)</CardTitle>
                </CardHeader>
                <CardContent>
                  {prodByType.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">Sem dados no período.</p>
                  ) : (
                    <div className="flex flex-col items-center gap-6">
                      <div className="w-full max-w-[420px]">
                        <ResponsiveContainer width="100%" height={320}>
                          <PieChart>
                            <Pie
                              data={prodByType}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={110}
                              innerRadius={50}
                              paddingAngle={3}
                              label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                            >
                              {prodByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(value: number) => [`${value} pçs`]} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-4">
                        {prodByType.map((d, i) => {
                          const total = prodByType.reduce((s, x) => s + x.value, 0);
                          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                          return (
                            <div key={d.name} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <div className="text-sm">
                                <span className="text-muted-foreground">{d.name}:</span>{' '}
                                <span className="font-bold">{d.value} pçs</span>{' '}
                                <span className="text-muted-foreground">({pct}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="etapas">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Tempo Médio por Etapa (horas)</CardTitle>
                </CardHeader>
                <CardContent>
                  {timePerStage.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">Sem dados de etapas no período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={timePerStage} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis dataKey="etapa" type="category" width={120} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Bar dataKey="media_horas" name="Média (h)" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Detailed Table */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Detalhamento por Ordem ({tableData.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Venda</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Peças</TableHead>
                      <TableHead>Início PCP</TableHead>
                      <TableHead>Fim PCP</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma ordem no período.</TableCell></TableRow>
                    ) : tableData.map(o => {
                      const statusColor = o.status === 'CONCLUIDA' ? 'bg-emerald-500/15 text-emerald-700'
                        : o.status === 'EM_ANDAMENTO' ? 'bg-blue-500/15 text-blue-700'
                        : 'bg-muted text-muted-foreground';
                      const statusLabel = o.status === 'CONCLUIDA' ? 'Concluída'
                        : o.status === 'EM_ANDAMENTO' ? 'Em Andamento'
                        : o.status === 'AGUARDANDO' ? 'Aguardando'
                        : o.status;
                      const tipoLabel = o.tipo_produto === 'SINTETICO' ? 'Sintético'
                        : o.tipo_produto === 'TECIDO' ? 'Tecido'
                        : o.tipo_produto === 'FIVELA_COBERTA' ? 'Fivela Cob.'
                        : o.tipo_produto || '—';
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">
                            {o.pedidos.api_venda_id}
                            {o.isOPLoja && <Badge className="ml-1 bg-amber-500/15 text-amber-700 text-[9px]" variant="outline">OP Loja</Badge>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[180px] truncate">{o.pedidos.cliente_nome}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{tipoLabel}</Badge></TableCell>
                          <TableCell className="tabular-nums">{o.quantidade}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {o.data_inicio_pcp ? format(toBrasilia(o.data_inicio_pcp), 'dd/MM HH:mm') : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {o.data_fim_pcp ? format(toBrasilia(o.data_fim_pcp), 'dd/MM HH:mm') : '—'}
                          </TableCell>
                          <TableCell className="text-sm font-medium tabular-nums">
                            {o.duracao !== null ? formatDuration(o.duracao) : '—'}
                          </TableCell>
                          <TableCell><Badge className={`font-normal ${statusColor}`}>{statusLabel}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
