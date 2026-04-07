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

interface OpLinha {
  tipo: string;
  label: string;
  total: number;
  concluidas: number;
  aguardando: number;
  emAndamento: number;
  deLoja: number;
  itens: number;
}

interface FluxoEntrada {
  fluxo: 'PRODUCAO' | 'PRONTA_ENTREGA' | 'PRONTA_ENTREGA_OP_LOJA';
  label: string;
  pedidos: number;
  itens: number;
  valor: number;
  produtos: ProdutoLinha[];
}

interface EntradaOPs {
  total: number;
  concluidas: number;
  deLoja: number;
  porTipo: OpLinha[];
}

interface DrillItem {
  pedidoId: string;
  numeroPedido: string;
  apiVendaId: string | null;
  clienteNome: string;
  unidades: number;
  itensOp: number;
  valor: number;
  dataCriacao: string;
  ops: { id: string; tipoProduto: string; status: string; origemOp: string | null; sequencia: number; observacao: string | null }[];
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
  const [ops, setOps] = useState<EntradaOPs>({ total: 0, concluidas: 0, deLoja: 0, porTipo: [] });
  const [dataInicioCustom, setDataInicioCustom] = useState('');
  const [dataFimCustom, setDataFimCustom] = useState('');
  const [periodoLabel, setPeriodoLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [drillKey, setDrillKey] = useState<string | null>(null); // 'PRODUCAO-Cinto Sintético'
  const [drillItems, setDrillItems] = useState<DrillItem[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [fluxoAberto, setFluxoAberto] = useState<string | null>('PRODUCAO');

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
      .select('id, valor_liquido, tipo_fluxo, criado_em, pedido_itens(quantidade, quantidade_faltante, disponivel, descricao_produto, categoria_produto, referencia_produto, valor_total)')
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
    // Buscar quais pedidos PRONTA_ENTREGA têm OP de loja
    const { data: opsLoja } = await supabase
      .from('ordens_producao')
      .select('pedido_id')
      .eq('origem_op', 'LOJA');
    const pedidosComOpLoja = new Set((opsLoja || []).map((o: any) => o.pedido_id));

    const fluxoMap: Record<string, {
      label: string;
      pedidos: number;
      itens: number;
      valor: number;
      produtos: Record<string, { pedidos: number; itens: number; valor: number }>;
    }> = {
      PRODUCAO: { label: 'Produção', pedidos: 0, itens: 0, valor: 0, produtos: {} },
      PRONTA_ENTREGA: { label: 'Pedido Enviado', pedidos: 0, itens: 0, valor: 0, produtos: {} },
      PRONTA_ENTREGA_OP_LOJA: { label: 'Pronta Entrega c/ OP Loja', pedidos: 0, itens: 0, valor: 0, produtos: {} },
    };

    let totalPedidos = 0;
    let totalItens = 0;
    let totalValor = 0;

    // Controle de quais pedidos têm ao menos 1 item reconhecido
    const pedidosComItemReconhecido = new Set<string>();

    for (const p of (pedidos || [])) {
      const tipoFluxoBase = (p as any).tipo_fluxo;
      const fluxo = tipoFluxoBase === 'PRONTA_ENTREGA' && pedidosComOpLoja.has(p.id)
        ? 'PRONTA_ENTREGA_OP_LOJA'
        : tipoFluxoBase === 'PRONTA_ENTREGA'
        ? 'PRONTA_ENTREGA'
        : 'PRODUCAO';
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
        // Para PRONTA_ENTREGA e PRONTA_ENTREGA_OP_LOJA: descontar itens que viraram OP (quantidade_faltante)
        const qtdTotal = item.quantidade || 1;
        const qtdFaltante = item.quantidade_faltante || 0;
        const qtd = (fluxo === 'PRONTA_ENTREGA' || fluxo === 'PRONTA_ENTREGA_OP_LOJA') && qtdFaltante > 0
          ? Math.max(0, qtdTotal - qtdFaltante)
          : qtdTotal;
        if (qtd <= 0) continue; // ignorar se todos viraram OP
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
      const tipoFluxoBase = (p as any).tipo_fluxo;
      const fluxo = tipoFluxoBase === 'PRONTA_ENTREGA' && pedidosComOpLoja.has(p.id)
        ? 'PRONTA_ENTREGA_OP_LOJA'
        : tipoFluxoBase === 'PRONTA_ENTREGA'
        ? 'PRONTA_ENTREGA'
        : 'PRODUCAO';
      const f = fluxoMap[fluxo];
      if (f.produtos[principal]) f.produtos[principal].pedidos++;
    }

    const ORDEM_CATEGORIAS = ['Cinto Sintético', 'Tira Sintético', 'Fivela Coberta', 'Cinto Tecido', 'Tira Tecido'];

    const fluxos: FluxoEntrada[] = Object.entries(fluxoMap)
      .filter(([, f]) => f.pedidos > 0)
      .map(([fluxo, f]) => ({
        fluxo: fluxo as 'PRODUCAO' | 'PRONTA_ENTREGA' | 'PRONTA_ENTREGA_OP_LOJA',
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

    // Buscar OPs geradas no mesmo período com itens faltantes
    const { data: opsData } = await supabase
      .from('ordens_producao')
      .select('tipo_produto, status, criado_em, origem_op, pedido_id, pedidos!inner(pedido_itens(quantidade, quantidade_faltante, descricao_produto, disponivel))')
      .in('tipo_produto', ['SINTETICO', 'TECIDO', 'FIVELA_COBERTA'])
      .gte('criado_em', dataInicio)
      .lte('criado_em', dataFim);

    const OP_LABELS: Record<string, string> = {
      SINTETICO: 'Sintético', TECIDO: 'Tecido', FIVELA_COBERTA: 'Fivela Coberta',
    };
    const OP_ORDEM = ['SINTETICO', 'TECIDO', 'FIVELA_COBERTA'];

    const CATEGORIAS_OP: Record<string, string[]> = {
      SINTETICO: ['CINTO SINTETICO', 'CINTO SINTÉTICO', 'TIRA SINTETICO', 'TIRA SINTÉTICO'],
      TECIDO: ['CINTO TECIDO', 'TIRA TECIDO'],
      FIVELA_COBERTA: ['FIVELA COBERTA'],
    };

    const itemPertenceTipo = (desc: string, tipo: string): boolean => {
      const u = (desc || '').toUpperCase();
      return (CATEGORIAS_OP[tipo] || []).some(kw => u.includes(kw));
    };

    const opMap: Record<string, { total: number; concluidas: number; aguardando: number; emAndamento: number; deLoja: number; itens: number }> = {};
    for (const op of (opsData || [])) {
      const t = (op as any).tipo_produto || 'OUTROS';
      if (!opMap[t]) opMap[t] = { total: 0, concluidas: 0, aguardando: 0, emAndamento: 0, deLoja: 0, itens: 0 };
      opMap[t].total++;
      if ((op as any).origem_op === 'LOJA') opMap[t].deLoja++;
      if (op.status === 'CONCLUIDA') opMap[t].concluidas++;
      else if (op.status === 'AGUARDANDO') opMap[t].aguardando++;
      else if (op.status === 'EM_ANDAMENTO') opMap[t].emAndamento++;

      // Contar itens do pedido que pertencem a este tipo de OP
      const pedidoItens = (op as any).pedidos?.pedido_itens || [];
      for (const item of pedidoItens) {
        if (!itemPertenceTipo(item.descricao_produto || '', t)) continue;
        // Se OP de loja: usar quantidade_faltante (itens que precisam ser produzidos)
        // Se OP normal: usar quantidade total do item
        const qtd = (op as any).origem_op === 'LOJA'
          ? (item.quantidade_faltante ?? item.quantidade ?? 1)
          : (item.quantidade ?? 1);
        opMap[t].itens += qtd;
      }
    }

    const opsPorTipo: OpLinha[] = OP_ORDEM
      .filter(t => opMap[t])
      .map(t => ({
        tipo: t,
        label: OP_LABELS[t] || t,
        total: opMap[t].total,
        concluidas: opMap[t].concluidas,
        aguardando: opMap[t].aguardando,
        emAndamento: opMap[t].emAndamento,
        deLoja: opMap[t].deLoja,
        itens: opMap[t].itens,
      }));

    const totalOps = (opsData || []).length;
    const concluidasOps = (opsData || []).filter(o => o.status === 'CONCLUIDA').length;
    const deLoja = (opsData || []).filter((o: any) => o.origem_op === 'LOJA').length;
    setOps({ total: totalOps, concluidas: concluidasOps, deLoja, porTipo: opsPorTipo });

    setEntrada({ totalPedidos, totalItens, totalValor, fluxos });
    setLoadingEntrada(false);
  }, []);

  useEffect(() => { if (entradaPeriodo !== 'custom') fetchEntrada(entradaPeriodo); }, [entradaPeriodo, fetchEntrada]);

  const fetchDrill = async (fluxo: string, descricao: string, dataInicio: string, dataFim: string) => {
    const key = `${fluxo}-${descricao}`;
    if (drillKey === key) { setDrillKey(null); return; }
    setDrillKey(key);
    setDrillLoading(true);
    setDrillItems([]);

    const inicio = (d: string) => `${d}T00:00:00-03:00`;
    const fim = (d: string) => `${d}T23:59:59-03:00`;

    const tipoFluxos = fluxo === 'PRODUCAO' ? ['PRODUCAO'] : ['PRONTA_ENTREGA', 'PRONTA_ENTREGA_OP_LOJA'];

    const CATEGORIAS_DRILL: Record<string, string[]> = {
      'Cinto Sintético': ['CINTO SINTETICO', 'CINTO SINTÉTICO'],
      'Tira Sintético':  ['TIRA SINTETICO', 'TIRA SINTÉTICO'],
      'Fivela Coberta':  ['FIVELA COBERTA'],
      'Cinto Tecido':    ['CINTO TECIDO'],
      'Tira Tecido':     ['TIRA TECIDO'],
    };
    const keywords = CATEGORIAS_DRILL[descricao] || [];

    const { data: pedidosRaw } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, api_venda_id, cliente_nome, valor_liquido, criado_em, pedido_itens(quantidade, quantidade_faltante, disponivel, descricao_produto)')
      .in('tipo_fluxo', tipoFluxos)
      .gte('criado_em', inicio(dataInicio))
      .lte('criado_em', fim(dataFim))
      .order('criado_em', { ascending: false });

    // Buscar OPs separadamente para garantir que todas são retornadas (join pode ser limitado)
    const pedidoIds = (pedidosRaw || []).map((p: any) => p.id);
    const { data: opsMap } = pedidoIds.length > 0
      ? await supabase
          .from('ordens_producao')
          .select('id, pedido_id, tipo_produto, status, origem_op, sequencia, observacao')
          .in('pedido_id', pedidoIds)
      : { data: [] };

    const opsPorPedido: Record<string, any[]> = {};
    for (const op of (opsMap || [])) {
      if (!opsPorPedido[op.pedido_id]) opsPorPedido[op.pedido_id] = [];
      opsPorPedido[op.pedido_id].push(op);
    }

    const items: DrillItem[] = [];
    for (const p of (pedidosRaw || [])) {
      const itens = (p as any).pedido_itens || [];
      const unidades = itens
        .filter((i: any) => keywords.some(kw => (i.descricao_produto || '').toUpperCase().includes(kw)))
        .reduce((s: number, i: any) => {
          const qtd = i.quantidade || 1;
          const falt = i.quantidade_faltante || 0;
          return s + (fluxo !== 'PRODUCAO' && falt > 0 ? Math.max(0, qtd - falt) : qtd);
        }, 0);
      if (unidades <= 0) continue;

      // Calcular itens que viraram OP para pedidos PRONTA_ENTREGA:
      // Estratégia em ordem de prioridade:
      // 1. quantidade_faltante preenchida → valor exato
      // 2. disponivel=false → quantidade total do item
      // 3. Tem OP de loja mas nenhum item marcado → usa quantidade total dos itens reconhecidos
      // OPs de loja: origem_op='LOJA' (novas) OU sequencia>1 sem origem (antigas)
      const pedidoOps = opsPorPedido[p.id] || [];
      const opsLoja = pedidoOps.filter((o: any) => o.origem_op === 'LOJA' || (o.sequencia > 1 && !o.origem_op));
      const temOpLoja = opsLoja.length > 0;

      let itensOpFinal = 0;
      if (temOpLoja) {
        // Estrategia 1: parsear observacao da OP formato '(700 un)'
        let somaObs = 0;
        for (const op of opsLoja) {
          const obs = (op.observacao || '') as string;
          const regex = /\((\d+)\s*un\)/gi;
          let m = regex.exec(obs);
          while (m) { somaObs += parseInt(m[1]) || 0; m = regex.exec(obs); }
        }
        if (somaObs > 0) {
          itensOpFinal = somaObs;
        } else {
          // Estrategia 2: quantidade_faltante ou disponivel=false
          const itensFiltrados = itens.filter((i: any) =>
            keywords.some(kw => (i.descricao_produto || '').toUpperCase().includes(kw))
          );
          const somaExplicita = itensFiltrados.reduce((s: number, i: any) => {
            if (i.quantidade_faltante != null && i.quantidade_faltante > 0) return s + i.quantidade_faltante;
            if (i.disponivel === false) return s + (i.quantidade || 1);
            return s;
          }, 0);
          // Estrategia 3: total dos itens reconhecidos
          itensOpFinal = somaExplicita > 0
            ? somaExplicita
            : itensFiltrados.reduce((s: number, i: any) => s + (i.quantidade || 1), 0);
        }
      }

      items.push({
        pedidoId: p.id,
        numeroPedido: p.numero_pedido,
        apiVendaId: (p as any).api_venda_id || null,
        clienteNome: p.cliente_nome,
        unidades,
        itensOp: itensOpFinal,
        valor: p.valor_liquido || 0,
        dataCriacao: p.criado_em,
        ops: pedidoOps.map((o: any) => ({
          id: o.id,
          tipoProduto: o.tipo_produto,
          status: o.status,
          origemOp: o.origem_op,
          sequencia: o.sequencia,
          observacao: o.observacao || null,
        })),
      });
    }

    setDrillItems(items);
    setDrillLoading(false);
  };

  const statusOpBadge = (status: string, origem: string | null, sequencia?: number) => {
    const isLoja = origem === 'LOJA' || (sequencia != null && sequencia > 1 && !origem);
    const label = isLoja ? 'OP Loja' : status === 'CONCLUIDA' ? 'Concluída' : status === 'EM_ANDAMENTO' ? 'Em andamento' : 'Aguardando';
    const cls = isLoja ? 'bg-purple-500/15 text-purple-700 border-purple-500/20' :
      status === 'CONCLUIDA' ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20' :
      status === 'EM_ANDAMENTO' ? 'bg-amber-500/15 text-amber-700 border-amber-500/20' :
      'bg-blue-500/15 text-blue-700 border-blue-500/20';
    return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cls}`}>{label}</span>;
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

              {/* Breakdown por fluxo com drill-down */}
              {entrada.fluxos.length > 0 && (
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  {entrada.fluxos.map((f, fi) => (
                    <div key={f.fluxo} className={fi > 0 ? 'border-t border-border/60' : ''}>
                      {/* Header do fluxo — clicável para expandir */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/40 transition-colors"
                        onClick={() => setFluxoAberto(fluxoAberto === f.fluxo ? null : f.fluxo)}
                      >
                        <svg
                          className={`h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0 ${fluxoAberto === f.fluxo ? 'rotate-90' : ''}`}
                          viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"
                        ><path d="M5 3l4 4-4 4"/></svg>
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm font-semibold">{f.label}</span>
                          {f.fluxo === 'PRONTA_ENTREGA_OP_LOJA' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-700 border border-purple-500/20">OP Loja</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="tabular-nums font-medium text-foreground">{f.pedidos} ped.</span>
                          <span className="tabular-nums font-medium text-primary">{f.itens} prod.</span>
                          {f.valor > 0 && <span className="tabular-nums">{fmt(f.valor)}</span>}
                        </div>
                      </div>

                      {/* Produtos do fluxo */}
                      {fluxoAberto === f.fluxo && (
                        <div className="border-t border-border/40 bg-muted/20">
                          {f.produtos.map((p, pi) => {
                            const key = `${f.fluxo}-${p.descricao}`;
                            const isOpen = drillKey === key;
                            return (
                              <div key={p.descricao} className={pi > 0 ? 'border-t border-border/30' : ''}>
                                {/* Linha do produto — clicável para abrir drill */}
                                <div
                                  className={`flex items-center gap-3 px-4 py-2.5 pl-10 cursor-pointer transition-colors ${isOpen ? 'bg-primary/5' : 'hover:bg-accent/30'}`}
                                  onClick={() => {
                                    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
                                    const brtFmt = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
                                    let di: string, df: string;
                                    if (entradaPeriodo === 'custom' && dataInicioCustom) {
                                      di = dataInicioCustom; df = dataFimCustom || dataInicioCustom;
                                    } else if (entradaPeriodo === 'hoje') {
                                      di = hoje; df = hoje;
                                    } else if (entradaPeriodo === 'semana') {
                                      di = brtFmt(new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 1))); df = hoje;
                                    } else if (entradaPeriodo === 'mes') {
                                      di = hoje.slice(0, 8) + '01'; df = hoje;
                                    } else if (entradaPeriodo === '7dias') {
                                      di = brtFmt(new Date(Date.now() - 7 * 86400000)); df = hoje;
                                    } else {
                                      di = brtFmt(new Date(Date.now() - 30 * 86400000)); df = hoje;
                                    }
                                    fetchDrill(f.fluxo, p.descricao, di, df);
                                  }}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOpen ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                                  <span className={`text-sm flex-1 ${isOpen ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{p.descricao}</span>
                                  <div className="flex items-center gap-4 text-xs tabular-nums">
                                    <span className="text-muted-foreground">{p.pedidos} ped.</span>
                                    <span className={`font-medium ${isOpen ? 'text-primary' : 'text-foreground'}`}>{p.itens} un.</span>
                                    <svg className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2l4 4-4 4"/></svg>
                                  </div>
                                </div>

                                {/* Drill-down: tabela de vendas e OPs */}
                                {isOpen && (
                                  <div className="border-t border-primary/20 bg-background">
                                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{p.descricao} — vendas e OPs</span>
                                      <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded" onClick={() => setDrillKey(null)}>fechar ×</button>
                                    </div>
                                    {drillLoading ? (
                                      <div className="flex justify-center py-6"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                                    ) : drillItems.length === 0 ? (
                                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido encontrado.</p>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="border-b border-border/40">
                                              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Pedido</th>
                                              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Nº Venda</th>
                                              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Cliente</th>
                                              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Un.</th>
                                              {f.fluxo !== 'PRODUCAO' && <th className="text-right px-4 py-2 text-muted-foreground font-medium">Un. OP</th>}
                                              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Valor</th>
                                              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Entrada</th>
                                              <th className="text-left px-4 py-2 text-muted-foreground font-medium">OPs</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {drillItems.map(item => (
                                              <tr key={item.pedidoId} className="border-b border-border/30 hover:bg-muted/40 transition-colors">
                                                <td className="px-4 py-2 font-medium text-foreground">{item.numeroPedido}</td>
                                                <td className="px-4 py-2 text-muted-foreground tabular-nums">{item.apiVendaId || '—'}</td>
                                                <td className="px-4 py-2 text-muted-foreground max-w-[140px] truncate">{item.clienteNome}</td>
                                                <td className="px-4 py-2 text-right tabular-nums font-medium">{item.unidades}</td>
                                                {f.fluxo !== 'PRODUCAO' && (
                                                  <td className="px-4 py-2 text-right tabular-nums">
                                                    {item.itensOp > 0
                                                      ? <span className="font-medium text-purple-700">{item.itensOp}</span>
                                                      : <span className="text-muted-foreground">—</span>
                                                    }
                                                  </td>
                                                )}
                                                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmt(item.valor)}</td>
                                                <td className="px-4 py-2 text-muted-foreground">{format(new Date(item.dataCriacao), 'dd/MM/yy', { locale: ptBR })}</td>
                                                <td className="px-4 py-2">
                                                  <div className="flex flex-wrap gap-1">
                                                    {item.ops.length === 0
                                                      ? <span className="text-muted-foreground">—</span>
                                                      : item.ops.map(op => (
                                                        <span key={op.id}>{statusOpBadge(op.status, op.origemOp, op.sequencia)}</span>
                                                      ))
                                                    }
                                                  </div>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {entrada.totalPedidos === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido recebido neste período.</p>
              )}

              {/* OPs geradas no período */}
              {ops.total > 0 && (
                <div className="border-t border-border/40 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-foreground">OPs geradas no período</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums font-medium text-foreground">{ops.total} total</span>
                      <span className="tabular-nums text-emerald-600 font-medium">{ops.concluidas} concluídas</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ops.porTipo.map(op => {
                      const pct = op.total > 0 ? Math.round((op.concluidas / op.total) * 100) : 0;
                      return (
                        <div key={op.tipo} className="flex items-center gap-3">
                          <div className="w-36 flex-shrink-0 flex items-center gap-1.5">
                            <span className="text-sm text-muted-foreground">{op.label}</span>
                            {op.deLoja > 0 && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600 border border-purple-500/20">
                                {op.deLoja} loja
                              </span>
                            )}
                          </div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 text-xs tabular-nums text-right">
                            {op.itens > 0 && <span className="text-muted-foreground">{op.itens} un.</span>}
                            <span className="text-emerald-600 font-medium">{op.concluidas}</span>
                            <span className="text-muted-foreground">/ {op.total} OPs</span>
                            <span className="text-muted-foreground w-8">({pct}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
