import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Package, CheckCircle2, CalendarCheck, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, subDays, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TIPO_PRODUTO_LABELS } from '@/lib/pcp';

interface OverviewCard {
  title: string;
  count: number;
  value: number;
  icon: React.ElementType;
  accent: string;
}

interface DayBar {
  day: string;
  count: number;
}

interface TypeProgress {
  tipo: string;
  label: string;
  meta: number;
  realizado: number;
}

interface ProdutoLinha {
  descricao: string;
  pedidos: number;
  itens: number;
  valor: number;
}

interface FluxoEntrada {
  fluxo: 'PRODUCAO' | 'PRONTA_ENTREGA';
  label: string;
  pedidos: number;
  itens: number;
  valor: number;
  produtos: ProdutoLinha[];
}

interface EntradaSimplifica {
  totalPedidos: number;
  totalItens: number;
  totalValor: number;
  fluxos: FluxoEntrada[];
}

export default function DashboardGestao() {
  const [cards, setCards] = useState<OverviewCard[]>([]);
  const [chart, setChart] = useState<DayBar[]>([]);
  const [typeProgress, setTypeProgress] = useState<TypeProgress[]>([]);
  const [entradaPeriodo, setEntradaPeriodo] = useState<'hoje' | 'semana' | 'mes' | '7dias' | '30dias' | 'custom'>('hoje');
  const [entrada, setEntrada] = useState<EntradaSimplifica>({ totalPedidos: 0, totalItens: 0, totalValor: 0, fluxos: [] });
  const [loadingEntrada, setLoadingEntrada] = useState(false);
  const [dataInicioCustom, setDataInicioCustom] = useState('');
  const [dataFimCustom, setDataFimCustom] = useState('');
  const [periodoLabel, setPeriodoLabel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const monthStart = today.slice(0, 8) + '01';

    // Overview cards
    const [rProd, rHoje, rMes, rAtraso] = await Promise.all([
      supabase.from('pedidos').select('valor_liquido').eq('status_atual', 'EM_PRODUCAO'),
      supabase.from('pedidos').select('valor_liquido').in('status_atual', ['PRODUCAO_CONCLUIDA', 'AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL', 'AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO', 'LIBERADO_LOGISTICA', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE']).gte('atualizado_em', today),
      supabase.from('pedidos').select('valor_liquido').in('status_atual', ['ENVIADO', 'ENTREGUE', 'FINALIZADO_SIMPLIFICA']).gte('atualizado_em', monthStart),
      supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('status_prazo', 'ATRASADO').in('status_atual', ['EM_PRODUCAO', 'AGUARDANDO_PRODUCAO']),
    ]);

    const sum = (rows: any[] | null) => (rows || []).reduce((s, r) => s + (r.valor_liquido || 0), 0);

    setCards([
      { title: 'Em Produção', count: rProd.data?.length || 0, value: sum(rProd.data), icon: Package, accent: 'text-primary' },
      { title: 'Concluídos Hoje', count: rHoje.data?.length || 0, value: sum(rHoje.data), icon: CheckCircle2, accent: 'text-[hsl(var(--success))]' },
      { title: 'Concluídos no Mês', count: rMes.data?.length || 0, value: sum(rMes.data), icon: CalendarCheck, accent: 'text-[hsl(var(--success))]' },
      { title: 'Em Atraso', count: rAtraso.count || 0, value: 0, icon: AlertTriangle, accent: 'text-destructive' },
    ]);

    // 7-day chart — single query instead of 7 sequential ones
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const { data: chartData } = await supabase
      .from('pedidos')
      .select('atualizado_em')
      .in('status_atual', ['ENVIADO', 'ENTREGUE', 'FINALIZADO_SIMPLIFICA', 'PRODUCAO_CONCLUIDA', 'AGUARDANDO_COMERCIAL'])
      .gte('atualizado_em', sevenDaysAgo);

    const dayCounts = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      dayCounts.set(format(d, 'yyyy-MM-dd'), 0);
    }
    for (const row of (chartData || [])) {
      const dayKey = format(new Date(row.atualizado_em), 'yyyy-MM-dd');
      if (dayCounts.has(dayKey)) {
        dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
      }
    }
    const days: DayBar[] = Array.from(dayCounts.entries()).map(([dateStr, count]) => ({
      day: format(new Date(dateStr + 'T12:00:00'), 'EEE', { locale: ptBR }),
      count,
    }));
    setChart(days);

    // Type progress (programmed today vs completed today)
    const { data: ordensHoje } = await supabase.from('ordens_producao').select('tipo_produto, status')
      .eq('programado_para_hoje', true).eq('data_programacao', today);

    const tipos = ['SINTETICO', 'TECIDO', 'FIVELA_COBERTA'];
    const tp: TypeProgress[] = tipos.map(t => {
      const all = (ordensHoje || []).filter(o => o.tipo_produto === t);
      return {
        tipo: t,
        label: TIPO_PRODUTO_LABELS[t] || t,
        meta: all.length,
        realizado: all.filter(o => o.status === 'CONCLUIDA').length,
      };
    }).filter(t => t.meta > 0);
    setTypeProgress(tp);

    setLoading(false);
  };

  const fetchEntrada = useCallback(async (periodo: typeof entradaPeriodo, customInicio?: string, customFim?: string) => {
    setLoadingEntrada(true);

    // Usar data local BRT diretamente — sem conversão de fuso
    // format() retorna a data no fuso local do browser, que está em BRT
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const brtFmt = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

    // Sufixo BRT para garantir que o Supabase interprete no fuso correto
    const inicio = (d: string) => `${d}T00:00:00-03:00`;
    const fim = (d: string) => `${d}T23:59:59-03:00`;

    let dataInicio: string;
    let dataFim: string = fim(hoje);

    if (periodo === 'custom' && customInicio) {
      dataInicio = inicio(customInicio);
      dataFim = fim(customFim || customInicio);
      const ini = format(new Date(customInicio + 'T12:00:00'), 'dd/MM/yyyy');
      const fimLabel = format(new Date((customFim || customInicio) + 'T12:00:00'), 'dd/MM/yyyy');
      setPeriodoLabel(customFim && customFim !== customInicio ? `${ini} até ${fimLabel}` : ini);
    } else if (periodo === 'hoje') {
      dataInicio = inicio(hoje);
      setPeriodoLabel(format(new Date(hoje + 'T12:00:00'), 'dd/MM/yyyy'));
    } else if (periodo === 'semana') {
      const now = new Date();
      const iniDate = startOfWeek(now, { weekStartsOn: 1 });
      const iniStr = brtFmt(iniDate);
      dataInicio = inicio(iniStr);
      setPeriodoLabel(`${format(new Date(iniStr + 'T12:00:00'), 'dd/MM')} até ${format(new Date(hoje + 'T12:00:00'), 'dd/MM/yyyy')}`);
    } else if (periodo === 'mes') {
      const now = new Date();
      const iniStr = brtFmt(startOfMonth(now));
      dataInicio = inicio(iniStr);
      setPeriodoLabel(`${format(new Date(iniStr + 'T12:00:00'), 'dd/MM')} até ${format(new Date(hoje + 'T12:00:00'), 'dd/MM/yyyy')}`);
    } else if (periodo === '7dias') {
      const iniStr = brtFmt(subDays(new Date(), 7));
      dataInicio = inicio(iniStr);
      setPeriodoLabel(`${format(new Date(iniStr + 'T12:00:00'), 'dd/MM')} até ${format(new Date(hoje + 'T12:00:00'), 'dd/MM/yyyy')}`);
    } else {
      const iniStr = brtFmt(subDays(new Date(), 30));
      dataInicio = inicio(iniStr);
      setPeriodoLabel(`${format(new Date(iniStr + 'T12:00:00'), 'dd/MM')} até ${format(new Date(hoje + 'T12:00:00'), 'dd/MM/yyyy')}`);
    }

    // tipo_fluxo = 'PRODUCAO' é salvo no momento da inserção e nunca muda
    // Garante que pegamos TODOS os pedidos que entraram como Em Produção,
    // independente do status atual (Finalizado, Enviado, etc.)
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id, valor_liquido, tipo_fluxo, criado_em, pedido_itens(quantidade, descricao_produto, categoria_produto, referencia_produto, valor_total)')
      .in('tipo_fluxo', ['PRODUCAO', 'PRONTA_ENTREGA'])
      .gte('criado_em', dataInicio)
      .lte('criado_em', dataFim);

    // Apenas estas 5 categorias são consideradas — tudo mais é ignorado
    const CATEGORIAS: { label: string; match: (u: string) => boolean }[] = [
      { label: 'Cinto Sintético', match: u => u.includes('CINTO SINTETICO') || u.includes('CINTO SINTÉTICO') },
      { label: 'Tira Sintético',  match: u => u.includes('TIRA SINTETICO')  || u.includes('TIRA SINTÉTICO') },
      { label: 'Fivela Coberta',  match: u => u.includes('FIVELA COBERTA') },
      { label: 'Cinto Tecido',    match: u => u.includes('CINTO TECIDO') },
      { label: 'Tira Tecido',     match: u => u.includes('TIRA TECIDO') },
    ];

    const classificarItem = (desc: string): string | null => {
      const u = (desc || '').toUpperCase().trim();
      for (const cat of CATEGORIAS) {
        if (cat.match(u)) return cat.label;
      }
      return null; // ignora tudo que não se encaixa
    };

    // Agrupar por fluxo → produto
    const fluxoMap: Record<string, {
      label: string;
      pedidos: number;
      itens: number;
      valor: number;
      produtos: Record<string, { pedidos: number; itens: number; valor: number }>;
    }> = {
      PRODUCAO: { label: 'Produção', pedidos: 0, itens: 0, valor: 0, produtos: {} },
      PRONTA_ENTREGA: { label: 'Pedido Enviado', pedidos: 0, itens: 0, valor: 0, produtos: {} },
    };

    let totalPedidos = 0;
    let totalItens = 0;
    let totalValor = 0;

    // Controle de quais pedidos têm ao menos 1 item reconhecido
    const pedidosComItemReconhecido = new Set<string>();

    for (const p of (pedidos || [])) {
      const fluxo = (p as any).tipo_fluxo === 'PRONTA_ENTREGA' ? 'PRONTA_ENTREGA' : 'PRODUCAO';
      const f = fluxoMap[fluxo];
      const itensArray = (p as any).pedido_itens || [];

      // Só processar itens reconhecidos
      for (const item of itensArray) {
        const label = classificarItem(item.descricao_produto || '');
        if (!label) continue; // ignora KIT, ADICIONAL, BOLSA, etc.

        if (!pedidosComItemReconhecido.has(p.id)) {
          pedidosComItemReconhecido.add(p.id);
          f.pedidos++;
          f.valor += p.valor_liquido || 0;
          totalPedidos++;
          totalValor += p.valor_liquido || 0;
        }

        if (!f.produtos[label]) f.produtos[label] = { pedidos: 0, itens: 0, valor: 0 };
        const qtd = item.quantidade || 1;
        f.produtos[label].itens += qtd;
        f.itens += qtd;
        totalItens += qtd;
      }
    }

    // Contar pedidos por produto principal (maior quantidade de itens reconhecidos)
    const pedidoProdutoPrincipal = new Map<string, string>();
    for (const p of (pedidos || [])) {
      if (!pedidosComItemReconhecido.has(p.id)) continue;
      const itensArray = (p as any).pedido_itens || [];
      const countPorLabel: Record<string, number> = {};
      for (const item of itensArray) {
        const label = classificarItem(item.descricao_produto || '');
        if (!label) continue;
        countPorLabel[label] = (countPorLabel[label] || 0) + (item.quantidade || 1);
      }
      const principal = Object.entries(countPorLabel).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (principal) pedidoProdutoPrincipal.set(p.id, principal);
    }

    for (const p of (pedidos || [])) {
      const principal = pedidoProdutoPrincipal.get(p.id);
      if (!principal) continue;
      const fluxo = (p as any).tipo_fluxo === 'PRONTA_ENTREGA' ? 'PRONTA_ENTREGA' : 'PRODUCAO';
      const f = fluxoMap[fluxo];
      if (f.produtos[principal]) f.produtos[principal].pedidos++;
    }

    const ORDEM_CATEGORIAS = ['Cinto Sintético', 'Tira Sintético', 'Fivela Coberta', 'Cinto Tecido', 'Tira Tecido'];

    const fluxos: FluxoEntrada[] = Object.entries(fluxoMap)
      .filter(([, f]) => f.pedidos > 0)
      .map(([fluxo, f]) => ({
        fluxo: fluxo as 'PRODUCAO' | 'PRONTA_ENTREGA',
        label: f.label,
        pedidos: f.pedidos,
        itens: f.itens,
        valor: f.valor,
        produtos: Object.entries(f.produtos)
          .map(([descricao, v]) => ({ descricao, ...v }))
          .filter(p => p.itens > 0)
          .sort((a, b) => {
            const ia = ORDEM_CATEGORIAS.indexOf(a.descricao);
            const ib = ORDEM_CATEGORIAS.indexOf(b.descricao);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return b.itens - a.itens;
          }),
      }));

    setEntrada({ totalPedidos, totalItens, totalValor, fluxos });
    setLoadingEntrada(false);
  }, []);

  useEffect(() => { if (entradaPeriodo !== 'custom') fetchEntrada(entradaPeriodo); }, [entradaPeriodo, fetchEntrada]);

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (loading) return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  const totalMeta = typeProgress.reduce((s, t) => s + t.meta, 0);
  const totalReal = typeProgress.reduce((s, t) => s + t.realizado, 0);
  const pct = totalMeta > 0 ? Math.round((totalReal / totalMeta) * 100) : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {/* Overview Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.title} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <c.icon className={`h-5 w-5 ${c.accent}`} />
                </div>
                <span className="text-sm text-muted-foreground">{c.title}</span>
              </div>
              <p className="text-3xl font-bold tabular-nums">{c.count}</p>
              {c.value > 0 && <p className="text-sm text-muted-foreground mt-1">{fmt(c.value)}</p>}
              {c.title === 'Em Atraso' && c.count > 0 && (
                <Badge className="mt-2 bg-destructive/15 text-destructive border-destructive/30">{c.count} pedidos</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entradas do Simplifica */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Pedidos Recebidos do Simplifica
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Em Produção + Pronta Entrega</p>
              {periodoLabel && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {periodoLabel}
                </span>
              )}
            </div>
            <div className="flex gap-1 flex-wrap items-center">
              {(['hoje', 'semana', 'mes', '7dias', '30dias'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setEntradaPeriodo(p)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    entradaPeriodo === p
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border/60 text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mês' : p === '7dias' ? '7 dias' : '30 dias'}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="date"
                  value={dataInicioCustom}
                  onChange={e => setDataInicioCustom(e.target.value)}
                  className="text-xs border border-border/60 rounded-md px-2 py-1 bg-background text-foreground h-7"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="date"
                  value={dataFimCustom}
                  onChange={e => setDataFimCustom(e.target.value)}
                  className="text-xs border border-border/60 rounded-md px-2 py-1 bg-background text-foreground h-7"
                />
                <button
                  onClick={() => {
                    if (dataInicioCustom) {
                      setEntradaPeriodo('custom');
                      fetchEntrada('custom', dataInicioCustom, dataFimCustom || dataInicioCustom);
                    }
                  }}
                  disabled={!dataInicioCustom}
                  className="px-3 py-1 text-xs rounded-full border border-primary text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors h-7"
                >
                  Buscar
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingEntrada ? (
            <div className="flex justify-center py-6"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
          ) : (
            <div className="space-y-4">
              {/* Totais gerais */}
              <div className="flex items-center gap-6 flex-wrap pb-2 border-b border-border/40">
                <div>
                  <span className="text-3xl font-bold tabular-nums">{entrada.totalPedidos}</span>
                  <span className="text-muted-foreground text-sm ml-2">pedidos</span>
                </div>
                <div className="h-8 w-px bg-border/60 hidden sm:block" />
                <div>
                  <span className="text-3xl font-bold tabular-nums">{entrada.totalItens}</span>
                  <span className="text-muted-foreground text-sm ml-2">produtos</span>
                </div>
                {entrada.totalValor > 0 && (
                  <>
                    <div className="h-8 w-px bg-border/60 hidden sm:block" />
                    <span className="text-lg font-semibold text-primary">{fmt(entrada.totalValor)}</span>
                  </>
                )}
              </div>

              {/* Breakdown por fluxo */}
              {entrada.fluxos.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {entrada.fluxos.map(f => (
                    <div key={f.fluxo} className="rounded-lg border border-border/60 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">{f.label}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="tabular-nums font-medium text-foreground">{f.pedidos} ped.</span>
                          <span className="tabular-nums font-medium text-primary">{f.itens} prod.</span>
                          {f.valor > 0 && <span className="tabular-nums">{fmt(f.valor)}</span>}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {f.produtos.map(p => (
                          <div key={p.descricao} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/50 inline-block" />
                              {p.descricao}
                            </span>
                            <div className="flex items-center gap-3 text-xs tabular-nums">
                              <span className="text-muted-foreground">{p.pedidos} ped.</span>
                              <span className="font-medium text-foreground">{p.itens} un.</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {entrada.totalPedidos === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido recebido neste período.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs do dia */}
      {typeProgress.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Meta do Dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{totalReal} de {totalMeta} ordens</span>
                  <span className="font-semibold">{pct}%</span>
                </div>
                <Progress value={pct} className="h-3" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {typeProgress.map(t => {
                const p = t.meta > 0 ? Math.round((t.realizado / t.meta) * 100) : 0;
                return (
                  <div key={t.tipo} className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm font-medium mb-1">{t.label}</p>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{t.realizado}/{t.meta}</span>
                      <span>{p}%</span>
                    </div>
                    <Progress value={p} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7-day chart */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pedidos Concluídos — Últimos 7 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                <Bar dataKey="count" name="Concluídos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
