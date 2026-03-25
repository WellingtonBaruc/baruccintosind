import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Scissors, AlertTriangle, Users, TrendingUp, Calendar, Download, Printer, User } from 'lucide-react';
import { agruparParaCorte, CutGroupItem, CutGroup, extrairAtributosProduto } from '@/lib/pcp';
import { CorteGroupCard } from '@/components/pcp/CorteGroupCard';
import { format, subDays, startOfDay, endOfDay, parseISO, differenceInMinutes } from 'date-fns';

const PERFIS_PCP = ['supervisor_producao', 'gestor', 'admin'];

const TIPO_KEYWORDS: Record<string, string[]> = {
  SINTETICO: ['CINTO SINTETICO', 'TIRA SINTETICO', 'CINTO SINTÉTICO', 'TIRA SINTÉTICO'],
  TECIDO: ['CINTO TECIDO', 'TIRA TECIDO'],
};

function matchesTipo(descricao: string, tipo: string): boolean {
  const upper = (descricao || '').toUpperCase();
  return (TIPO_KEYWORDS[tipo] || []).some(kw => upper.includes(kw));
}

interface DailyStats {
  operadoresHoje: number;
  cortadosHoje: number;
  registros: { operador_nome: string; quantidade: number; concluido_em: string }[];
}

const PERIODO_OPTIONS = [
  { label: 'Hoje', value: '0' },
  { label: '7 dias', value: '7' },
  { label: '15 dias', value: '15' },
  { label: '30 dias', value: '30' },
];

export default function PCP() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState<CutGroupItem[]>([]);
  const [leadTimeStats, setLeadTimeStats] = useState({ atrasados: 0, atencao: 0, noPrazo: 0 });
  const [filterLarguraSint, setFilterLarguraSint] = useState('all');
  const [filterLarguraTec, setFilterLarguraTec] = useState('all');
  const [janelaDiasSint, setJanelaDiasSint] = useState<number | null>(null);
  const [janelaDiasTec, setJanelaDiasTec] = useState<number | null>(null);
  // Manual OPs
  const [manualGroups, setManualGroups] = useState<{ SINTETICO: CutGroup[]; TECIDO: CutGroup[] }>({ SINTETICO: [], TECIDO: [] });
  // Fase 3: daily production
  const [dailyStats, setDailyStats] = useState<DailyStats>({ operadoresHoje: 0, cortadosHoje: 0, registros: [] });
  const [dailyPeriodo, setDailyPeriodo] = useState('0');
  const [loadingDaily, setLoadingDaily] = useState(false);
  // Fase 5: reports
  const [reportPeriodo, setReportPeriodo] = useState('7');
  const [reportData, setReportData] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Debounced realtime refresh — flags track which data needs refreshing
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef({ data: false, manual: false, daily: false });

  const scheduleRefresh = useCallback((flags: { data?: boolean; manual?: boolean; daily?: boolean }) => {
    if (flags.data) pendingRef.current.data = true;
    if (flags.manual) pendingRef.current.manual = true;
    if (flags.daily) pendingRef.current.daily = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const p = pendingRef.current;
      if (p.data) fetchData();
      if (p.manual) fetchManualOPs();
      if (p.daily) fetchDailyStats();
      pendingRef.current = { data: false, manual: false, daily: false };
    }, 1500);
  }, []);

  useEffect(() => {
    fetchData();
    fetchManualOPs();

    // Realtime: listen to all tables relevant to Setor Corte
    const channel = supabase
      .channel('pcp-corte-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => scheduleRefresh({ data: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_itens' }, () => scheduleRefresh({ data: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_producao' }, () => scheduleRefresh({ data: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_obs_corte' }, () => scheduleRefresh({ data: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pcp_corte_registro' }, () => scheduleRefresh({ data: true, daily: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pcp_corte_manual' }, () => scheduleRefresh({ manual: true }))
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => { fetchDailyStats(); }, [dailyPeriodo]);

  const fetchData = async () => {
    const { data: ordens } = await supabase
      .from('ordens_producao')
      .select('id, pedido_id, tipo_produto, pedidos!inner(numero_pedido, api_venda_id, cliente_nome, status_prazo, status_atual, data_venda_api, lead_time_preparacao_dias)')
      .in('tipo_produto', ['SINTETICO', 'TECIDO'])
      .in('status', ['EM_ANDAMENTO', 'AGUARDANDO'])
      .eq('pedidos.status_atual', 'EM_PRODUCAO');

    if (!ordens?.length) { setLoading(false); return; }

    const pedidoIds = [...new Set(ordens.map(o => o.pedido_id))];
    const itensRes = await supabase
      .from('pedido_itens')
      .select('id, pedido_id, descricao_produto, referencia_produto, observacao_producao, quantidade')
      .in('pedido_id', pedidoIds);
    const itens = itensRes.data;

    // Fetch obs_corte only for item IDs we actually have
    const itemIds = (itens || []).map((i: any) => i.id);
    const { data: obsCorteData } = itemIds.length > 0
      ? await supabase
          .from('pedido_item_obs_corte')
          .select('id, pedido_item_id, observacao, criado_em, lido, lido_em')
          .in('pedido_item_id', itemIds)
      : { data: [] };

    const obsCorteMap = new Map<string, { id: string; observacao: string; criado_em: string; lido: boolean; lido_em: string | null }[]>();
    for (const obs of (obsCorteRes.data || [])) {
      const list = obsCorteMap.get(obs.pedido_item_id) || [];
      list.push({ id: obs.id, observacao: obs.observacao, criado_em: obs.criado_em, lido: obs.lido, lido_em: obs.lido_em });
      obsCorteMap.set(obs.pedido_item_id, list);
    }

    const pedidoTipoMap = new Map<string, { numero_venda: string | null; data_venda: string | null; lead_time_dias: number | null }>();
    for (const o of ordens) {
      const p = o.pedidos as any;
      const key = `${o.pedido_id}|${o.tipo_produto}`;
      if (p && !pedidoTipoMap.has(key)) {
        pedidoTipoMap.set(key, {
          numero_venda: p.api_venda_id || p.numero_pedido,
          data_venda: p.data_venda_api,
          lead_time_dias: p.lead_time_preparacao_dias,
        });
      }
    }

    const cutItems: CutGroupItem[] = [];
    for (const [key, info] of pedidoTipoMap) {
      const [pedidoId, tipo] = key.split('|');
      for (const i of (itens || []).filter(it => it.pedido_id === pedidoId)) {
        if (matchesTipo(i.descricao_produto, tipo)) {
          cutItems.push({
            id: i.id,
            descricao: i.descricao_produto,
            referencia: i.referencia_produto,
            observacao_producao: i.observacao_producao,
            quantidade: i.quantidade,
            numero_venda: info.numero_venda,
            data_venda: info.data_venda,
            lead_time_dias: info.lead_time_dias,
            tipo_produto: tipo,
            obs_corte: obsCorteMap.get(i.id) || [],
          });
        }
      }
    }

    setAllItems(cutItems);

    const [r1, r2, r3] = await Promise.all([
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'ATRASADO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'ATENCAO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'NO_PRAZO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
    ]);
    setLeadTimeStats({ atrasados: r1.count || 0, atencao: r2.count || 0, noPrazo: r3.count || 0 });
    setLoading(false);
  };

  const fetchManualOPs = async () => {
    const { data } = await supabase
      .from('pcp_corte_manual')
      .select('*')
      .in('status', ['PENDENTE', 'INICIADO'])
      .order('criado_em', { ascending: true });

    const result: { SINTETICO: CutGroup[]; TECIDO: CutGroup[] } = { SINTETICO: [], TECIDO: [] };
    for (const m of (data || [])) {
      const attrs = m.largura && m.material && m.tamanho && m.cor
        ? { largura: m.largura, material: m.material, tamanho: m.tamanho, cor: m.cor }
        : extrairAtributosProduto(m.descricao);
      const group: CutGroup & { _manual_status: string; _manual_operador_id: string | null } = {
        ...attrs,
        itens: [{
          id: m.id,
          descricao: m.descricao,
          referencia: null,
          observacao_producao: m.observacao,
          quantidade: m.quantidade,
        }],
        quantidadeTotal: m.quantidade,
        is_manual: true,
        manual_id: m.id,
        manual_descricao: m.descricao,
        manual_data_inicio: m.data_inicio,
        manual_data_fim: m.data_fim,
        manual_observacao: m.observacao,
        _manual_status: m.status,
        _manual_operador_id: m.operador_id,
      };
      const tipo = m.tipo_produto as 'SINTETICO' | 'TECIDO';
      if (result[tipo]) result[tipo].push(group);
    }
    setManualGroups(result);
  };

  const fetchDailyStats = async () => {
    setLoadingDaily(true);
    const days = parseInt(dailyPeriodo) || 0;
    const desde = days === 0
      ? format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm:ss")
      : format(startOfDay(subDays(new Date(), days)), "yyyy-MM-dd'T'HH:mm:ss");

    const { data } = await supabase
      .from('pcp_corte_registro')
      .select('operador_id, quantidade_cortada, concluido_em')
      .eq('status', 'CONCLUIDO')
      .gte('concluido_em', desde);

    const { data: operadores } = await supabase
      .from('pcp_operadores_corte')
      .select('id, nome')
      .eq('ativo', true);

    const opMap = new Map((operadores || []).map(o => [o.id, o.nome]));
    const opTotals = new Map<string, number>();
    let totalCortado = 0;

    for (const r of (data || [])) {
      const qty = r.quantidade_cortada || 0;
      totalCortado += qty;
      if (r.operador_id) {
        opTotals.set(r.operador_id, (opTotals.get(r.operador_id) || 0) + qty);
      }
    }

    const registros = Array.from(opTotals.entries()).map(([opId, qty]) => ({
      operador_nome: opMap.get(opId) || 'Desconhecido',
      quantidade: qty,
      concluido_em: '',
    })).sort((a, b) => b.quantidade - a.quantidade);

    setDailyStats({
      operadoresHoje: opTotals.size,
      cortadosHoje: totalCortado,
      registros,
    });
    setLoadingDaily(false);
  };

  // Fase 5: Report generation
  const fetchReport = async () => {
    setLoadingReport(true);
    const days = parseInt(reportPeriodo) || 7;
    const desde = format(startOfDay(subDays(new Date(), days)), "yyyy-MM-dd'T'HH:mm:ss");

    const { data: registros } = await supabase
      .from('pcp_corte_registro')
      .select('operador_id, quantidade_cortada, concluido_em, iniciado_em, tipo_produto, largura, material, tamanho, cor')
      .eq('status', 'CONCLUIDO')
      .gte('concluido_em', desde);

    const { data: manuais } = await supabase
      .from('pcp_corte_manual')
      .select('id, tipo_produto, descricao, quantidade, observacao, operador_id, status, concluido_em, data_inicio, data_fim')
      .eq('status', 'CONCLUIDO')
      .gte('concluido_em', desde);

    const { data: operadores } = await supabase
      .from('pcp_operadores_corte')
      .select('id, nome')
      .eq('ativo', true);

    const opMap = new Map((operadores || []).map(o => [o.id, o.nome]));

    // Calculate metrics
    let totalCortado = 0;
    let totalSintetico = 0;
    let totalTecido = 0;
    const opStats = new Map<string, { nome: string; quantidade: number; cortes: number }>();
    const dailyTotals = new Map<string, number>();
    let totalTempoMin = 0;
    let cortesComTempo = 0;

    for (const r of (registros || [])) {
      const qty = r.quantidade_cortada || 0;
      totalCortado += qty;
      if (r.tipo_produto === 'SINTETICO') totalSintetico += qty;
      if (r.tipo_produto === 'TECIDO') totalTecido += qty;

      if (r.operador_id) {
        const existing = opStats.get(r.operador_id) || { nome: opMap.get(r.operador_id) || 'Desconhecido', quantidade: 0, cortes: 0 };
        existing.quantidade += qty;
        existing.cortes += 1;
        opStats.set(r.operador_id, existing);
      }

      if (r.concluido_em) {
        const dia = format(parseISO(r.concluido_em), 'yyyy-MM-dd');
        dailyTotals.set(dia, (dailyTotals.get(dia) || 0) + qty);
      }

      if (r.iniciado_em && r.concluido_em) {
        const mins = differenceInMinutes(parseISO(r.concluido_em), parseISO(r.iniciado_em));
        if (mins > 0) { totalTempoMin += mins; cortesComTempo++; }
      }
    }

    const diasAtivos = dailyTotals.size || 1;
    const mediaDia = Math.round(totalCortado / diasAtivos);
    const tempoMedio = cortesComTempo > 0 ? Math.round(totalTempoMin / cortesComTempo) : 0;

    setReportData({
      totalCortado,
      totalSintetico,
      totalTecido,
      totalGrupos: (registros || []).length,
      operadores: Array.from(opStats.values()).sort((a, b) => b.quantidade - a.quantidade),
      operadoresUnicos: opStats.size,
      mediaPorOperador: opStats.size > 0 ? Math.round(totalCortado / opStats.size) : 0,
      mediaPorDia: mediaDia,
      tempoMedioMin: tempoMedio,
      manuaisConcluidos: (manuais || []).length,
      dailyTotals: Array.from(dailyTotals.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    });
    setLoadingReport(false);
  };

  useEffect(() => { fetchReport(); }, [reportPeriodo]);

  const handleExportCSV = () => {
    if (!reportData) return;
    let csv = 'Métrica,Valor\n';
    csv += `Total Cortado,${reportData.totalCortado}\n`;
    csv += `Sintético,${reportData.totalSintetico}\n`;
    csv += `Tecido,${reportData.totalTecido}\n`;
    csv += `Grupos Concluídos,${reportData.totalGrupos}\n`;
    csv += `Operadores Únicos,${reportData.operadoresUnicos}\n`;
    csv += `Média/Operador,${reportData.mediaPorOperador}\n`;
    csv += `Média/Dia,${reportData.mediaPorDia}\n`;
    csv += `Tempo Médio (min),${reportData.tempoMedioMin}\n`;
    csv += `OPs Manuais,${reportData.manuaisConcluidos}\n`;
    csv += '\nOperador,Quantidade,Cortes\n';
    for (const op of reportData.operadores) {
      csv += `${op.nome},${op.quantidade},${op.cortes}\n`;
    }
    csv += '\nDia,Total\n';
    for (const [dia, total] of reportData.dailyTotals) {
      csv += `${format(parseISO(dia), 'dd/MM/yyyy')},${total}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-corte-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    if (!reportData) return;
    const periodoLabel = REPORT_PERIODO_OPTIONS.find(o => o.value === reportPeriodo)?.label || '';
    const opRows = reportData.operadores.map((op: any) =>
      `<tr><td>${op.nome}</td><td style="text-align:right">${op.quantidade}</td><td style="text-align:right">${op.cortes}</td></tr>`
    ).join('');
    const dailyRows = reportData.dailyTotals.map(([dia, total]: [string, number]) =>
      `<tr><td>${format(parseISO(dia), 'dd/MM/yyyy')}</td><td style="text-align:right">${total}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><title>Relatório Corte</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:15mm}
    h1{font-size:16px;margin-bottom:4px}h2{font-size:13px;margin:12px 0 4px}.meta{color:#666;font-size:11px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
    th{background:#f0f0f0;font-size:11px;text-transform:uppercase}.kpi{display:inline-block;border:1px solid #ccc;padding:8px 16px;margin:4px;border-radius:6px;text-align:center}
    .kpi .val{font-size:20px;font-weight:bold}.kpi .lbl{font-size:10px;color:#666}@media print{body{padding:10mm}}</style>
    </head><body>
    <h1>Relatório do Setor Corte — ${periodoLabel}</h1>
    <p class="meta">${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
    <div style="margin:10px 0">
      <div class="kpi"><div class="val">${reportData.totalCortado}</div><div class="lbl">Total Cortado</div></div>
      <div class="kpi"><div class="val">${reportData.totalSintetico}</div><div class="lbl">Sintético</div></div>
      <div class="kpi"><div class="val">${reportData.totalTecido}</div><div class="lbl">Tecido</div></div>
      <div class="kpi"><div class="val">${reportData.operadoresUnicos}</div><div class="lbl">Operadores</div></div>
      <div class="kpi"><div class="val">${reportData.mediaPorDia}</div><div class="lbl">Média/Dia</div></div>
      <div class="kpi"><div class="val">${reportData.tempoMedioMin}min</div><div class="lbl">Tempo Médio</div></div>
    </div>
    <h2>Por Operador</h2>
    <table><thead><tr><th>Operador</th><th style="text-align:right">Quantidade</th><th style="text-align:right">Cortes</th></tr></thead><tbody>${opRows}</tbody></table>
    <h2>Por Dia</h2>
    <table><thead><tr><th>Dia</th><th style="text-align:right">Total</th></tr></thead><tbody>${dailyRows}</tbody></table>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // Separate items by tipo
  const sinteticoItems = useMemo(() => allItems.filter(i => i.tipo_produto === 'SINTETICO'), [allItems]);
  const tecidoItems = useMemo(() => allItems.filter(i => i.tipo_produto === 'TECIDO'), [allItems]);

  const sinteticoGroups = useMemo(() => {
    const realGroups = agruparParaCorte(sinteticoItems, janelaDiasSint);
    return [...realGroups, ...manualGroups.SINTETICO];
  }, [sinteticoItems, janelaDiasSint, manualGroups]);

  const tecidoGroups = useMemo(() => {
    const realGroups = agruparParaCorte(tecidoItems, janelaDiasTec);
    return [...realGroups, ...manualGroups.TECIDO];
  }, [tecidoItems, janelaDiasTec, manualGroups]);

  const largurasSint = useMemo(() => [...new Set(sinteticoGroups.map(g => g.largura))].sort(), [sinteticoGroups]);
  const largurasTec = useMemo(() => [...new Set(tecidoGroups.map(g => g.largura))].sort(), [tecidoGroups]);

  const handleManualRefresh = useCallback(() => { fetchManualOPs(); }, []);

  if (!profile || !PERFIS_PCP.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const REPORT_PERIODO_OPTIONS = [
    { label: 'Diário (hoje)', value: '1' },
    { label: 'Semanal (7d)', value: '7' },
    { label: 'Quinzenal (15d)', value: '15' },
    { label: 'Mensal (30d)', value: '30' },
  ];

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

      {/* Fase 3: Daily production stats */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Produção do Corte
          </CardTitle>
          <Select value={dailyPeriodo} onValueChange={setDailyPeriodo}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODO_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingDaily ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums">{dailyStats.operadoresHoje}</p>
                  <p className="text-[10px] text-muted-foreground">Operadores</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-[hsl(var(--success))]/10 flex items-center justify-center">
                  <Scissors className="h-4 w-4 text-[hsl(var(--success))]" />
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums">{dailyStats.cortadosHoje}</p>
                  <p className="text-[10px] text-muted-foreground">Cintos cortados</p>
                </div>
              </div>
              {dailyStats.registros.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                  {dailyStats.registros.slice(0, 5).map((r, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] gap-1">
                      <User className="h-3 w-3" />
                      {r.operador_nome}: {r.quantidade}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <CorteGroupCard
            title="Corte — Sintético"
            tipo="SINTETICO"
            groups={sinteticoGroups}
            filterLargura={filterLarguraSint}
            onFilterLarguraChange={setFilterLarguraSint}
            larguras={largurasSint}
            janelaDias={janelaDiasSint}
            onJanelaDiasChange={setJanelaDiasSint}
            onManualAdded={handleManualRefresh}
          />
          <CorteGroupCard
            title="Corte — Tecido"
            tipo="TECIDO"
            groups={tecidoGroups}
            filterLargura={filterLarguraTec}
            onFilterLarguraChange={setFilterLarguraTec}
            larguras={largurasTec}
            janelaDias={janelaDiasTec}
            onJanelaDiasChange={setJanelaDiasTec}
            onManualAdded={handleManualRefresh}
          />
        </div>
      )}

      {/* Fase 5: Reports */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Relatório do Corte
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={reportPeriodo} onValueChange={setReportPeriodo}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_PERIODO_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportCSV} disabled={!reportData}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handlePrintReport} disabled={!reportData}>
              <Printer className="h-3.5 w-3.5" />
              PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingReport ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : reportData ? (
            <div className="space-y-4">
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {[
                  { label: 'Total Cortado', value: reportData.totalCortado, color: 'text-foreground' },
                  { label: 'Sintético', value: reportData.totalSintetico, color: 'text-purple-600' },
                  { label: 'Tecido', value: reportData.totalTecido, color: 'text-orange-600' },
                  { label: 'Operadores', value: reportData.operadoresUnicos, color: 'text-primary' },
                  { label: 'Média/Dia', value: reportData.mediaPorDia, color: 'text-[hsl(var(--success))]' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-muted/30 border rounded-lg p-3 text-center">
                    <p className={`text-lg font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Per operator */}
                {reportData.operadores.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Por Operador</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Operador</TableHead>
                          <TableHead className="text-xs text-right">Qtd</TableHead>
                          <TableHead className="text-xs text-right">Cortes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.operadores.map((op: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{op.nome}</TableCell>
                            <TableCell className="text-sm text-right font-semibold tabular-nums">{op.quantidade}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{op.cortes}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Per day */}
                {reportData.dailyTotals.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Por Dia</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Dia</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.dailyTotals.map(([dia, total]: [string, number], i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{format(parseISO(dia), 'dd/MM/yyyy')}</TableCell>
                            <TableCell className="text-sm text-right font-semibold tabular-nums">{total}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Extra metrics */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-2 border-t">
                <span>Tempo médio: <strong className="text-foreground">{reportData.tempoMedioMin}min</strong></span>
                <span>Média/operador: <strong className="text-foreground">{reportData.mediaPorOperador}</strong></span>
                <span>Grupos concluídos: <strong className="text-foreground">{reportData.totalGrupos}</strong></span>
                <span>OPs manuais: <strong className="text-foreground">{reportData.manuaisConcluidos}</strong></span>
              </div>
            </div>
          ) : (
            <p className="text-center py-6 text-muted-foreground text-sm">Sem dados no período.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
