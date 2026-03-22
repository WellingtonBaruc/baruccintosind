import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Package, CheckCircle2, CalendarCheck, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, subDays } from 'date-fns';
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

export default function DashboardGestao() {
  const [cards, setCards] = useState<OverviewCard[]>([]);
  const [chart, setChart] = useState<DayBar[]>([]);
  const [typeProgress, setTypeProgress] = useState<TypeProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const today = new Date().toISOString().slice(0, 10);
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

    // 7-day chart
    const days: DayBar[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const ds = format(d, 'yyyy-MM-dd');
      const de = format(subDays(new Date(), i - 1), 'yyyy-MM-dd');
      const { count } = await supabase.from('pedidos').select('*', { count: 'exact', head: true })
        .in('status_atual', ['ENVIADO', 'ENTREGUE', 'FINALIZADO_SIMPLIFICA', 'PRODUCAO_CONCLUIDA', 'AGUARDANDO_COMERCIAL'])
        .gte('atualizado_em', ds).lt('atualizado_em', de);
      days.push({ day: format(d, 'EEE', { locale: ptBR }), count: count || 0 });
    }
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
