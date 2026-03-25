import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Package, Clock, AlertTriangle, CheckCircle2, TrendingUp, BarChart3, Factory } from 'lucide-react';
import { format, subDays, subWeeks, subMonths, startOfDay, differenceInHours, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';

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

interface ItemCount {
  pedido_id: string;
  total_qty: number;
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
  const [itemCounts, setItemCounts] = useState<ItemCount[]>([]);
  const [pedidosSimplifica, setPedidosSimplifica] = useState<PedidoSimplifica[]>([]);
  const [periodo, setPeriodo] = useState<PeriodoFilter>('30d');
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const dateRange = useMemo(() => {
    const end = new Date();
    let start: Date;
    switch (periodo) {
      case '7d': start = subDays(end, 7); break;
      case '15d': start = subDays(end, 15); break;
      case '30d': start = subMonths(end, 1); break;
      case '90d': start = subMonths(end, 3); break;
      case 'custom':
        start = customStart ? new Date(customStart + 'T00:00:00') : subMonths(end, 1);
        if (customEnd) return { start, end: new Date(customEnd + 'T23:59:59') };
        return { start, end };
      default: start = subMonths(end, 1);
    }
    return { start: startOfDay(start), end };
  }, [periodo, customStart, customEnd]);

  useEffect(() => { fetchData(); }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    const startISO = dateRange.start.toISOString();
    const endISO = dateRange.end.toISOString();

    const [ordensRes, etapasRes, simplificaRes] = await Promise.all([
      supabase
        .from('ordens_producao')
        .select('id, pedido_id, tipo_produto, status, sequencia, criado_em, data_inicio_pcp, data_fim_pcp, programado_inicio_data, programado_conclusao_data, pedidos!inner(api_venda_id, cliente_nome, data_previsao_entrega, status_atual)')
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
        .eq('status_atual', 'FINALIZADO_SIMPLIFICA')
        .gte('atualizado_em', startISO)
        .lte('atualizado_em', endISO),
    ]);

    const ordensData = (ordensRes.data || []) as unknown as OrdemData[];
    const etapasData = (etapasRes.data || []) as unknown as EtapaData[];
    const simplificaData = (simplificaRes.data || []) as PedidoSimplifica[];

    // Filter out simplifica pedidos that already have production orders
    const pedidoIdsComOP = new Set(ordensData.map(o => o.pedido_id));
    const simplificaSemOP = simplificaData.filter(p => !pedidoIdsComOP.has(p.id));

    // Fetch item counts for the pedido_ids
    const pedidoIds = [...new Set([...ordensData.map(o => o.pedido_id), ...simplificaSemOP.map(p => p.id)])];
    let itemsData: ItemCount[] = [];
    if (pedidoIds.length > 0) {
      const { data: items } = await supabase
        .from('pedido_itens')
        .select('pedido_id, quantidade')
        .in('pedido_id', pedidoIds);
      if (items) {
        const grouped: Record<string, number> = {};
        items.forEach((i: any) => {
          grouped[i.pedido_id] = (grouped[i.pedido_id] || 0) + (i.quantidade || 0);
        });
        itemsData = Object.entries(grouped).map(([pedido_id, total_qty]) => ({ pedido_id, total_qty }));
      }
    }

    setOrdens(ordensData);
    setEtapas(etapasData);
    setItemCounts(itemsData);
    setPedidosSimplifica(simplificaSemOP);
    setLoading(false);
  };

  const filteredOrdens = tipoFilter === 'all' ? ordens : ordens.filter(o => o.tipo_produto === tipoFilter);

  // ========== KPI CALCULATIONS ==========
  const totalOPs = filteredOrdens.length;
  const opsFinalizadas = filteredOrdens.filter(o => o.status === 'CONCLUIDA').length;
  const opsEmAndamento = filteredOrdens.filter(o => o.status === 'EM_ANDAMENTO').length;
  const opsAguardando = filteredOrdens.filter(o => o.status === 'AGUARDANDO').length;

  const totalPecas = useMemo(() => {
    const pedidoIdsInFilter = new Set(filteredOrdens.map(o => o.pedido_id));
    return itemCounts
      .filter(ic => pedidoIdsInFilter.has(ic.pedido_id))
      .reduce((sum, ic) => sum + ic.total_qty, 0);
  }, [filteredOrdens, itemCounts]);

  const atrasados = filteredOrdens.filter(o => {
    if (o.status === 'CONCLUIDA') return false;
    if (!o.pedidos.data_previsao_entrega) return false;
    return new Date(o.pedidos.data_previsao_entrega + 'T23:59:59') < new Date();
  }).length;

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
  // Production by type (pie)
  const prodByType = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrdens.forEach(o => {
      const tipo = o.tipo_produto || 'OUTROS';
      counts[tipo] = (counts[tipo] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name: name === 'SINTETICO' ? 'Sintético' : name === 'TECIDO' ? 'Tecido' : name === 'FIVELA_COBERTA' ? 'Fivela Coberta' : name, value }));
  }, [filteredOrdens]);

  // Daily production stacked chart (OPs concluídas + Simplifica sem OP, por tipo)
  const dailyProductionStacked = useMemo(() => {
    const days: Record<string, { sintetico: number; tecido: number; simplifica_sintetico: number; simplifica_tecido: number; sortKey: string }> = {};

    const ensureDay = (dateStr: string) => {
      const d = new Date(dateStr);
      const key = format(d, 'dd/MM');
      const sortKey = format(d, 'yyyy-MM-dd');
      if (!days[key]) days[key] = { sintetico: 0, tecido: 0, simplifica_sintetico: 0, simplifica_tecido: 0, sortKey };
      return key;
    };

    // 1) OPs finalizadas internamente
    filteredOrdens.filter(o => o.status === 'CONCLUIDA' && o.data_fim_pcp).forEach(o => {
      const key = ensureDay(o.data_fim_pcp!);
      if (o.tipo_produto === 'SINTETICO') days[key].sintetico++;
      else if (o.tipo_produto === 'TECIDO') days[key].tecido++;
    });

    // 2) Pedidos finalizados no Simplifica sem OP
    pedidosSimplifica.forEach(p => {
      const key = ensureDay(p.atualizado_em);
      // Without OP we can't determine type precisely, count as simplifica
      days[key].simplifica_sintetico++;
    });

    return Object.entries(days)
      .map(([dia, d]) => ({
        dia,
        sortKey: d.sortKey,
        sintetico: d.sintetico,
        tecido: d.tecido,
        simplifica: d.simplifica_sintetico + d.simplifica_tecido,
        total: d.sintetico + d.tecido + d.simplifica_sintetico + d.simplifica_tecido,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-14);
  }, [filteredOrdens, pedidosSimplifica]);

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

  // Bottleneck - stage with most items stuck
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
  const tableData = useMemo(() => {
    return filteredOrdens.map(o => {
      const itemCount = itemCounts.find(ic => ic.pedido_id === o.pedido_id);
      const durationMins = o.data_inicio_pcp && o.data_fim_pcp
        ? differenceInMinutes(new Date(o.data_fim_pcp), new Date(o.data_inicio_pcp))
        : null;
      return {
        ...o,
        quantidade: itemCount?.total_qty || 0,
        duracao: durationMins,
        isOPLoja: o.sequencia > 1,
      };
    });
  }, [filteredOrdens, itemCounts]);

  if (!profile || !PERFIS_PRODUCAO.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const kpiCards = [
    { label: 'Total Peças', value: totalPecas.toLocaleString('pt-BR'), icon: Package, colorClass: 'text-foreground', bgClass: 'bg-muted' },
    { label: 'OPs Finalizadas', value: opsFinalizadas, icon: CheckCircle2, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-500/10' },
    { label: 'OPs em Andamento', value: opsEmAndamento, icon: Factory, colorClass: 'text-blue-600', bgClass: 'bg-blue-500/10' },
    { label: 'OPs Aguardando', value: opsAguardando, icon: Clock, colorClass: 'text-amber-600', bgClass: 'bg-amber-500/10' },
    { label: 'Tempo Médio', value: formatDuration(avgProducaoMinutes), icon: TrendingUp, colorClass: 'text-purple-600', bgClass: 'bg-purple-500/10' },
    { label: 'Atrasados', value: atrasados, icon: AlertTriangle, colorClass: 'text-destructive', bgClass: 'bg-destructive/10' },
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
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-[150px]" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Até</label>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-[150px]" />
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
          {/* KPI Cards */}
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
              <TabsTrigger value="diario">Produção Diária</TabsTrigger>
              <TabsTrigger value="tipo">Por Tipo</TabsTrigger>
              <TabsTrigger value="etapas">Tempo por Etapa</TabsTrigger>
            </TabsList>

            <TabsContent value="diario">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Produção Diária — Sintético / Tecido / Simplifica</CardTitle>
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
                            formatter={(value: number, name: string) => [value, name]}
                          />
                          <Legend />
                          <Bar dataKey="sintetico" name="Sintético (OP)" stackId="a" fill="hsl(217, 91%, 60%)" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="tecido" name="Tecido (OP)" stackId="a" fill="hsl(142, 71%, 45%)" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="simplifica" name="Simplifica (sem OP)" stackId="a" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
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
                              <TableHead className="text-right">Simplifica</TableHead>
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
                                  <TableCell className="text-right tabular-nums">{d.simplifica}</TableCell>
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
                  <CardTitle className="text-base font-semibold">Distribuição por Tipo de Produto</CardTitle>
                </CardHeader>
                <CardContent>
                  {prodByType.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">Sem dados no período.</p>
                  ) : (
                    <div className="flex items-center justify-center gap-8 flex-wrap">
                      <ResponsiveContainer width={280} height={280}>
                        <PieChart>
                          <Pie data={prodByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {prodByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        {prodByType.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-sm">{d.name}: <span className="font-bold">{d.value}</span></span>
                          </div>
                        ))}
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
                            {o.data_inicio_pcp ? format(new Date(o.data_inicio_pcp), 'dd/MM HH:mm') : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {o.data_fim_pcp ? format(new Date(o.data_fim_pcp), 'dd/MM HH:mm') : '—'}
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
