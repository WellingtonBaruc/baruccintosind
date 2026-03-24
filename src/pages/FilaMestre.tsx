import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_PRAZO_CONFIG, TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { STATUS_PEDIDO_CONFIG } from '@/lib/producao';
import { PcpCalendarData, calcularPrazoPcp } from '@/lib/pcpCalendario';
import ConfigurarPcpDialog from '@/components/pcp/ConfigurarPcpDialog';
import PcpIntelligenceBar from '@/components/pcp/PcpIntelligenceBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Loader2, Calendar, AlertTriangle, Settings, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface EtapaInfo {
  id: string;
  nome_etapa: string;
  ordem_sequencia: number;
  status: string;
}

interface VendaRow {
  id: string;
  api_venda_id: string | null;
  numero_pedido: string;
  cliente_nome: string;
  valor_liquido: number;
  data_venda_api: string | null;
  data_previsao_entrega: string | null;
  status_atual: string;
  status_prazo: string | null;
  status_api: string | null;
  observacao_api: string | null;
  criado_em: string;
  ordem_id: string | null;
  ordem_status: string | null;
  tipo_produto: string | null;
  etapa_atual: string;
  operador_atual: string;
  data_inicio_pcp: string | null;
  data_fim_pcp: string | null;
  is_piloto: boolean;
  status_piloto: string | null;
  fivelas_separadas: boolean;
  // PCP calculated fields
  dataPcpCalculada: string | null;
  dataInicioIdeal: string | null;
  atrasoDias: number;
  prioridade: 'URGENTE' | 'ATENCAO' | 'NORMAL';
  etapas: EtapaInfo[];
}

interface PedidoDetail {
  pedido: any;
  itens: any[];
  historico: any[];
  ordens: any[];
  perdas: any[];
}

export default function FilaMestre() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<VendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [prazoFilter, setPrazoFilter] = useState('all');
  const [configOpen, setConfigOpen] = useState(false);

  // PCP data
  const [calendarData, setCalendarData] = useState<PcpCalendarData>({ sabadoAtivo: false, domingoAtivo: false, feriados: [], pausas: [] });
  const [leadTimes, setLeadTimes] = useState<Record<string, number>>({});

  // Side panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PedidoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Inline editing
  const [editingPcp, setEditingPcp] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Debounced realtime refresh
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetchAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchAll(), 400);
  }, []);

  useEffect(() => {
    fetchAll();

    // Realtime: refresh when ordens_producao or op_etapas change
    const channel = supabase
      .channel('filamestre-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_producao' }, debouncedFetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'op_etapas' }, debouncedFetchAll)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCalendarData = async () => {
    const [configRes, feriadosRes, pausasRes, ltRes] = await Promise.all([
      supabase.from('pcp_config_semana').select('*').limit(1).single(),
      supabase.from('pcp_feriados').select('data'),
      supabase.from('pcp_pausas').select('data_inicio, data_fim'),
      supabase.from('pcp_lead_times').select('tipo, lead_time_dias').eq('ativo', true),
    ]);
    const cal: PcpCalendarData = {
      sabadoAtivo: configRes.data?.sabado_ativo ?? false,
      domingoAtivo: configRes.data?.domingo_ativo ?? false,
      feriados: (feriadosRes.data || []).map((f: any) => f.data),
      pausas: (pausasRes.data || []).map((p: any) => ({ inicio: p.data_inicio, fim: p.data_fim })),
    };
    const lts: Record<string, number> = {};
    (ltRes.data || []).forEach((lt: any) => { lts[lt.tipo] = lt.lead_time_dias; });
    setCalendarData(cal);
    setLeadTimes(lts);
    return { cal, lts };
  };

  const fetchAll = async () => {
    const { cal, lts } = await fetchCalendarData();
    await fetchRows(cal, lts);
  };

  const fetchRows = async (cal: PcpCalendarData, lts: Record<string, number>) => {
    // 1) Fetch pedidos with status_api = 'Em Produção'
    const { data: pedidosEmProducao } = await supabase
      .from('pedidos')
      .select('id, api_venda_id, numero_pedido, cliente_nome, valor_liquido, data_venda_api, data_previsao_entrega, status_atual, status_prazo, status_api, observacao_api, criado_em, is_piloto, status_piloto, fivelas_separadas')
      .eq('status_api', 'Em Produção')
      .order('criado_em', { ascending: false });

    // 2) Fetch active ordens_producao (not completed/cancelled) to find complementary OPs from Loja
    const { data: todasOrdens } = await supabase
      .from('ordens_producao')
      .select('id, pedido_id, tipo_produto, status, data_inicio_pcp, data_fim_pcp, sequencia')
      .not('status', 'in', '("CONCLUIDA","CANCELADA")');

    // 3) Find pedido_ids that have active OPs but are NOT in the first query (e.g. complementary OPs from Loja)
    const emProducaoIds = new Set((pedidosEmProducao || []).map(p => p.id));
    const opPedidoIds = [...new Set((todasOrdens || []).map(o => o.pedido_id))].filter(id => !emProducaoIds.has(id));

    // For backfill: only include pedidos with complementary OPs (sequencia > 1)
    // This prevents "Pedido Enviado" pedidos from leaking into Fila Mestre
    const complementaryOpPedidoIds = new Set<string>();
    for (const o of (todasOrdens || [])) {
      if ((o as any).sequencia > 1 && !emProducaoIds.has(o.pedido_id)) {
        complementaryOpPedidoIds.add(o.pedido_id);
      }
    }
    // Also include pedidos that have active primary OPs and status_api = 'Em Produção'
    // (these should already be in emProducaoIds, but just in case)
    const backfillIds = [...complementaryOpPedidoIds];

    let pedidosComOp: any[] = [];
    if (backfillIds.length > 0) {
      const { data } = await supabase
        .from('pedidos')
        .select('id, api_venda_id, numero_pedido, cliente_nome, valor_liquido, data_venda_api, data_previsao_entrega, status_atual, status_prazo, status_api, observacao_api, criado_em, is_piloto, status_piloto, fivelas_separadas')
        .in('id', backfillIds)
        .not('status_atual', 'in', '("HISTORICO","CANCELADO","FINALIZADO_SIMPLIFICA")');
      pedidosComOp = data || [];
    }

    const pedidos = [...(pedidosEmProducao || []), ...pedidosComOp];
    if (pedidos.length === 0) { setRows([]); setLoading(false); return; }

    const pedidoIds = pedidos.map(p => p.id);
    // Re-fetch all ordens for these pedidos (including completed ones for display)
    const { data: ordens } = await supabase
      .from('ordens_producao')
      .select('id, pedido_id, tipo_produto, status, data_inicio_pcp, data_fim_pcp')
      .in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']);

    const ordemIds = (ordens || []).map(o => o.id);
    const { data: etapas } = await supabase
      .from('op_etapas')
      .select('id, ordem_id, nome_etapa, operador_id, status, ordem_sequencia, usuarios(nome)')
      .in('ordem_id', ordemIds.length > 0 ? ordemIds : ['none'])
      .order('ordem_sequencia', { ascending: true });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const vendas: VendaRow[] = pedidos.map(p => {
      const ordem = (ordens || []).find(o => o.pedido_id === p.id);
      const allOrdemEtapas = ordem ? (etapas || []).filter(e => e.ordem_id === ordem.id) : [];
      const etapaAtiva = allOrdemEtapas.find(e => e.status === 'EM_ANDAMENTO') || allOrdemEtapas.find(e => e.status === 'PENDENTE') || null;

      let etapaDisplay = '—';
      if (ordem) {
        if (ordem.status === 'AGUARDANDO') etapaDisplay = 'Aguardando Início';
        else if (ordem.status === 'CONCLUIDA') etapaDisplay = 'Concluída';
        else if (etapaAtiva) etapaDisplay = etapaAtiva.nome_etapa;
        else etapaDisplay = ordem.status;
      }

      // PCP calculation
      const tipoProduto = ordem?.tipo_produto || null;
      const lt = lts[tipoProduto || ''] ?? 5;
      const pcp = calcularPrazoPcp(p.data_previsao_entrega, lt, cal, new Date(today));

      // Recalculate status_prazo based on delivery date
      const ATENCAO_DIAS = 3;
      let statusPrazo = 'NO_PRAZO';
      if (p.data_previsao_entrega) {
        const previsao = new Date(p.data_previsao_entrega + 'T00:00:00');
        const diffMs = previsao.getTime() - today.getTime();
        const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDias < 0) statusPrazo = 'ATRASADO';
        else if (diffDias <= ATENCAO_DIAS) statusPrazo = 'ATENCAO';
      }

      return {
        ...p,
        ordem_id: ordem?.id || null,
        ordem_status: ordem?.status || null,
        tipo_produto: tipoProduto,
        etapa_atual: etapaDisplay,
        operador_atual: (etapaAtiva?.usuarios as any)?.nome || '—',
        data_inicio_pcp: (ordem as any)?.data_inicio_pcp || null,
        data_fim_pcp: (ordem as any)?.data_fim_pcp || null,
        is_piloto: (p as any).is_piloto || false,
        status_piloto: (p as any).status_piloto || null,
        fivelas_separadas: (p as any).fivelas_separadas || false,
        observacao_api: (p as any).observacao_api || null,
        status_prazo: statusPrazo,
        dataPcpCalculada: pcp.dataPcpCalculada,
        dataInicioIdeal: pcp.dataInicioIdeal,
        atrasoDias: pcp.atrasoDias,
        prioridade: pcp.prioridade,
        etapas: allOrdemEtapas.map((e: any) => ({ id: e.id, nome_etapa: e.nome_etapa, ordem_sequencia: e.ordem_sequencia, status: e.status })),
      };
    });

    setRows(vendas);
    setLoading(false);
  };
  // Admin move order to a specific etapa
  const handleMoveToEtapa = async (row: VendaRow, targetEtapa: EtapaInfo) => {
    if (!profile || !['admin', 'gestor'].includes(profile.perfil)) return;
    if (!row.ordem_id) return;
    
    const etapas = row.etapas || [];
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
    await supabase.from('ordens_producao').update({ status: 'EM_ANDAMENTO' } as any).eq('id', row.ordem_id);
    toast.success(`Ordem movida para: ${targetEtapa.nome_etapa}`);
    fetchAll();
  };

  const handleMoveToConcluido = async (row: VendaRow) => {
    if (!profile || !['admin', 'gestor'].includes(profile.perfil)) return;
    if (!row.ordem_id) return;
    for (const et of row.etapas) {
      if (et.status !== 'CONCLUIDA') {
        await supabase.from('op_etapas').update({ status: 'CONCLUIDA', concluido_em: new Date().toISOString() } as any).eq('id', et.id);
      }
    }
    await supabase.from('ordens_producao').update({ status: 'CONCLUIDA' } as any).eq('id', row.ordem_id);
    toast.success('Ordem marcada como Concluída');
    fetchAll();
  };

  const openDetail = async (pedidoId: string) => {
    setSelectedId(pedidoId);
    setDetailLoading(true);
    const [rPedido, rItens, rHist, rOrdens] = await Promise.all([
      supabase.from('pedidos').select('*').eq('id', pedidoId).single(),
      supabase.from('pedido_itens').select('*').eq('pedido_id', pedidoId),
      supabase.from('pedido_historico').select('*, usuarios(nome)').eq('pedido_id', pedidoId).order('criado_em', { ascending: false }),
      supabase.from('ordens_producao').select('*, pipeline_producao(nome)').eq('pedido_id', pedidoId),
    ]);
    const ordemIds = (rOrdens.data || []).map((o: any) => o.id);
    const { data: perdas } = await supabase.from('ordem_perdas').select('*, usuarios:registrado_por(nome)').in('ordem_id', ordemIds.length > 0 ? ordemIds : ['none']);
    setDetail({
      pedido: rPedido.data,
      itens: rItens.data || [],
      historico: rHist.data || [],
      ordens: rOrdens.data || [],
      perdas: perdas || [],
    });
    setDetailLoading(false);
  };

  const savePcpDate = async (ordemId: string, field: string, value: string) => {
    await supabase.from('ordens_producao').update({ [field]: value || null } as any).eq('id', ordemId);
    setEditingPcp(null);
    fetchAll();
  };

  // Filters
  const filtered = rows.filter(r => {
    if (search && !r.cliente_nome.toLowerCase().includes(search.toLowerCase()) && !r.numero_pedido.toLowerCase().includes(search.toLowerCase()) && !(r.api_venda_id || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (tipoFilter !== 'all' && r.tipo_produto !== tipoFilter) return false;
    if (statusFilter !== 'all' && r.status_atual !== statusFilter) return false;
    if (prazoFilter === 'ATRASADO' && r.status_prazo !== 'ATRASADO') return false;
    if (prazoFilter === 'HOJE' && r.data_previsao_entrega !== new Date().toISOString().slice(0, 10)) return false;
    if (prazoFilter === 'FUTURO' && (r.status_prazo === 'ATRASADO' || r.data_previsao_entrega === new Date().toISOString().slice(0, 10))) return false;
    return true;
  });

  // Smart sorting: 1. Priority (URGENTE first), 2. Earliest delivery, 3. Highest delay
  const prioOrder: Record<string, number> = { URGENTE: 0, ATENCAO: 1, NORMAL: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const pa = prioOrder[a.prioridade] ?? 3;
    const pb = prioOrder[b.prioridade] ?? 3;
    if (pa !== pb) return pa - pb;
    const dA = a.data_previsao_entrega || '9999-12-31';
    const dB = b.data_previsao_entrega || '9999-12-31';
    if (dA !== dB) return dA.localeCompare(dB);
    return a.atrasoDias - b.atrasoDias;
  });

  // Intelligence bar stats
  const tipoStats = Object.entries(leadTimes)
    .filter(([tipo]) => tipo !== 'FIVELA_COBERTA')
    .map(([tipo, lt]) => {
    const tipoRows = rows.filter(r => r.tipo_produto === tipo);
    const emProducao = tipoRows.filter(r => r.status_atual === 'EM_PRODUCAO').length;
    const emFila = tipoRows.filter(r => r.status_atual === 'AGUARDANDO_PRODUCAO').length;
    const atrasados = tipoRows.filter(r => r.prioridade === 'URGENTE');
    const atrasoMedio = atrasados.length > 0 ? atrasados.reduce((s, r) => s + Math.abs(r.atrasoDias), 0) / atrasados.length : 0;
    return {
      tipo,
      tipoLabel: TIPO_PRODUTO_LABELS[tipo] || tipo,
      leadTime: lt,
      emProducao,
      emFila,
      atrasoMedio,
    };
  });

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string | null) => d ? format(new Date(d + 'T00:00:00'), 'dd/MM/yy') : '—';
  const fmtDateTime = (d: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const canEdit = profile && ['admin', 'gestor', 'supervisor_producao'].includes(profile.perfil);

  const prioConfig: Record<string, { icon: string; color: string; label: string }> = {
    URGENTE: { icon: '🔴', color: 'bg-destructive/15 text-destructive border-destructive/30', label: 'Urgente' },
    ATENCAO: { icon: '🟡', color: 'bg-warning/15 text-warning border-warning/30', label: 'Atenção' },
    NORMAL: { icon: '🟢', color: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30', label: 'Normal' },
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Fila Mestre</h1>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => setConfigOpen(true)}>
              <Settings className="h-4 w-4 mr-1.5" /> Configurar PCP
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/painel-dia')}>
            <Calendar className="h-4 w-4 mr-1.5" /> Painel do Dia
          </Button>
        </div>
      </div>

      {/* Intelligence Bar */}
      <PcpIntelligenceBar stats={tipoStats} />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="SINTETICO">Sintético</SelectItem>
            <SelectItem value="TECIDO">Tecido</SelectItem>
            <SelectItem value="FIVELA_COBERTA">Fivela Coberta</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_PEDIDO_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prazoFilter} onValueChange={setPrazoFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Prazo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ATRASADO">Atrasados</SelectItem>
            <SelectItem value="HOJE">Hoje</SelectItem>
            <SelectItem value="FUTURO">Futuros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="flex gap-3 flex-wrap text-sm">
        <Badge variant="outline" className="text-sm py-1 px-3">{sorted.length} pedidos</Badge>
        <Badge className="bg-destructive/15 text-destructive border-destructive/30 py-1 px-3">
          {sorted.filter(r => r.prioridade === 'URGENTE').length} urgentes
        </Badge>
        <Badge className="bg-warning/15 text-warning border-warning/30 py-1 px-3">
          {sorted.filter(r => r.prioridade === 'ATENCAO').length} atenção
        </Badge>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sorted.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">Nenhum pedido encontrado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map(r => {
            const prazoCfg = STATUS_PRAZO_CONFIG[r.status_prazo || 'NO_PRAZO'];
            const tipoBadge = TIPO_PRODUTO_BADGE[r.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border';
            const tipoLabel = TIPO_PRODUTO_LABELS[r.tipo_produto || ''] || 'A classificar';
            const prioCfg = prioConfig[r.prioridade];
            const isAdmin = profile && ['admin', 'gestor'].includes(profile.perfil);
            const etapas = r.etapas || [];

            return (
              <Card
                key={r.id}
                className={`border-border/60 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${r.prioridade === 'URGENTE' ? 'border-destructive/40' : ''}`}
                onClick={() => openDetail(r.id)}
              >
                {/* Header */}
                <div className={`px-4 py-2.5 border-b flex items-center justify-between ${
                  r.prioridade === 'URGENTE' ? 'bg-destructive/10' :
                  r.prioridade === 'ATENCAO' ? 'bg-warning/10' :
                  'bg-muted/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <span>{prazoCfg?.icon}</span>
                    <span className="font-semibold text-sm">{r.api_venda_id || r.numero_pedido}</span>
                    <Badge className={`text-[10px] font-normal ${prioCfg.color}`}>{prioCfg.label}</Badge>
                  </div>
                  <Badge className={`text-[10px] font-normal ${tipoBadge}`}>{tipoLabel}</Badge>
                </div>

                <CardContent className="p-4 space-y-3">
                  {/* Client & Value */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate">{r.cliente_nome}</p>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{fmt(r.valor_liquido)}</span>
                  </div>

                  {/* Status & Operador */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] font-normal ${(STATUS_PEDIDO_CONFIG[r.status_atual] || {}).color || 'bg-muted text-muted-foreground'}`}>
                      {(STATUS_PEDIDO_CONFIG[r.status_atual] || {}).label || r.status_atual}
                    </Badge>
                    {r.operador_atual !== '—' && (
                      <span className="text-xs text-muted-foreground">👤 {r.operador_atual}</span>
                    )}
                    {r.status_api && (
                      <span className="text-[10px] text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">{r.status_api}</span>
                    )}
                  </div>

                  {/* Dates grid */}
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                    <div className="text-muted-foreground">Venda: <span className="text-foreground">{fmtDate(r.data_venda_api)}</span></div>
                    <div className="text-muted-foreground">Entrega: <span className="text-foreground font-medium">{fmtDate(r.data_previsao_entrega)}</span></div>
                    <div className="text-muted-foreground">Início Ideal: <span className="text-foreground">{fmtDate(r.dataInicioIdeal)}</span></div>
                    <div className="text-muted-foreground">Início PCP: <span className="text-foreground">{fmtDateTime(r.data_inicio_pcp)}</span></div>
                    <div className="text-muted-foreground">Fim PCP: <span className="text-foreground">{fmtDateTime(r.data_fim_pcp)}</span></div>
                    <div className="text-muted-foreground">Atraso: {
                      r.atrasoDias < 0 ? <span className="text-destructive font-semibold">{r.atrasoDias}d</span> :
                      r.atrasoDias <= 2 ? <span className="text-warning font-semibold">{r.atrasoDias}d</span> :
                      <span className="text-foreground">{r.atrasoDias}d</span>
                    }</div>
                  </div>

                  {/* Etapa + badges */}
                  <div className="flex items-center gap-1.5 flex-wrap border-t border-border/40 pt-2">
                    <span className="text-xs text-muted-foreground">Etapa:</span>
                    <span className="text-xs font-semibold">{r.etapa_atual}</span>
                    {r.is_piloto && (
                      <Badge className={`text-[10px] ${r.status_piloto === 'REPROVADO' ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-purple-500/15 text-purple-600 border-purple-500/30'}`}>
                        {r.status_piloto === 'REPROVADO' ? 'PILOTO ✗' : 'PILOTO'}
                      </Badge>
                    )}
                    {r.fivelas_separadas && (
                      <Badge className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                        Fivelas ✓
                      </Badge>
                    )}
                    {r.observacao_api?.includes('[IMPORTADO SEM DATA PREVISTA]') && (
                      <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                        📋 Sem data prevista
                      </Badge>
                    )}
                    {r.ordem_status && (
                      <Badge variant="outline" className="text-[10px] font-normal ml-auto">
                        OP: {r.ordem_status === 'AGUARDANDO' ? 'Aguardando' : r.ordem_status === 'EM_ANDAMENTO' ? 'Em Andamento' : r.ordem_status === 'CONCLUIDA' ? 'Concluída' : r.ordem_status}
                      </Badge>
                    )}
                  </div>

                  {/* Progress bar */}
                  {etapas.length > 0 && (
                    <TooltipProvider delayDuration={200}>
                      <div className="flex items-center gap-0.5 flex-wrap">
                        {etapas.map((etapa) => {
                          const isConcluida = etapa.status === 'CONCLUIDA';
                          const isEmAndamento = etapa.status === 'EM_ANDAMENTO';
                          return (
                            <Tooltip key={etapa.id}>
                              <TooltipTrigger asChild>
                                <button
                                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-all ${
                                    isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'
                                  } ${
                                    isConcluida ? 'bg-green-100 text-green-700' :
                                    isEmAndamento ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30' :
                                    'bg-muted/60 text-muted-foreground'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isAdmin) handleMoveToEtapa(r, etapa);
                                  }}
                                >
                                  {isConcluida && <CheckCircle2 className="h-2.5 w-2.5" />}
                                  <span className="truncate max-w-[60px]">{etapa.nome_etapa}</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-medium">{etapa.nome_etapa}</p>
                                <p className="text-muted-foreground">{isConcluida ? 'Concluída' : isEmAndamento ? 'Em Andamento' : 'Pendente'}</p>
                                {isAdmin && <p className="text-primary mt-0.5">Clique para mover</p>}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-all ${
                                isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'
                              } ${
                                r.ordem_status === 'CONCLUIDA' ? 'bg-green-100 text-green-700 font-semibold' : 'bg-muted/60 text-muted-foreground'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isAdmin) handleMoveToConcluido(r);
                              }}
                            >
                              {r.ordem_status === 'CONCLUIDA' && <CheckCircle2 className="h-2.5 w-2.5" />}
                              <span>Concluído</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">Concluído</p>
                            {isAdmin && <p className="text-primary mt-0.5">Clique para concluir</p>}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Side Panel */}
      <Sheet open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhe do Pedido</SheetTitle>
          </SheetHeader>
          {detailLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : detail ? (
            <Tabs defaultValue="info" className="mt-4">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="info">Dados</TabsTrigger>
                <TabsTrigger value="itens">Itens ({detail.itens.length})</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Pedido:</span> <span className="font-medium">{detail.pedido.numero_pedido}</span></div>
                  <div><span className="text-muted-foreground">Venda:</span> <span className="font-medium">{detail.pedido.api_venda_id || '—'}</span></div>
                  <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{detail.pedido.cliente_nome}</span></div>
                  <div><span className="text-muted-foreground">Valor:</span> <span className="font-medium">{fmt(detail.pedido.valor_liquido)}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge className={`font-normal text-xs ${(STATUS_PEDIDO_CONFIG[detail.pedido.status_atual] || {}).color || ''}`}>{(STATUS_PEDIDO_CONFIG[detail.pedido.status_atual] || {}).label || detail.pedido.status_atual}</Badge></div>
                  <div><span className="text-muted-foreground">Prazo:</span> <span>{STATUS_PRAZO_CONFIG[detail.pedido.status_prazo || 'NO_PRAZO']?.icon} {STATUS_PRAZO_CONFIG[detail.pedido.status_prazo || 'NO_PRAZO']?.label}</span></div>
                  <div><span className="text-muted-foreground">Prev. Entrega:</span> <span>{fmtDate(detail.pedido.data_previsao_entrega)}</span></div>
                  <div><span className="text-muted-foreground">Dt. Venda:</span> <span>{fmtDate(detail.pedido.data_venda_api)}</span></div>
                  {detail.pedido.cliente_telefone && <div><span className="text-muted-foreground">Telefone:</span> <span>{detail.pedido.cliente_telefone}</span></div>}
                  {detail.pedido.cliente_email && <div><span className="text-muted-foreground">Email:</span> <span>{detail.pedido.cliente_email}</span></div>}
                  {detail.pedido.cliente_endereco && <div className="col-span-2"><span className="text-muted-foreground">Endereço:</span> <span>{detail.pedido.cliente_endereco}</span></div>}
                  {detail.pedido.forma_pagamento && <div><span className="text-muted-foreground">Pagamento:</span> <span>{detail.pedido.forma_pagamento}</span></div>}
                  {detail.pedido.forma_envio && <div><span className="text-muted-foreground">Envio:</span> <span>{detail.pedido.forma_envio}</span></div>}
                  {detail.pedido.vendedor_nome && <div><span className="text-muted-foreground">Vendedor:</span> <span>{detail.pedido.vendedor_nome}</span></div>}
                </div>
                {detail.pedido.observacao_api && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Observação (API)</p>
                    <p>{detail.pedido.observacao_api}</p>
                  </div>
                )}
                {detail.pedido.observacao_interna_api && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Observação Interna</p>
                    <p>{detail.pedido.observacao_interna_api}</p>
                  </div>
                )}
                {detail.ordens.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Ordens de Produção</p>
                    {detail.ordens.map((o: any) => (
                      <div key={o.id} className="rounded-lg border border-border/60 p-3 text-sm flex items-center justify-between">
                        <div>
                          <span className="font-medium">{o.pipeline_producao?.nome}</span>
                          <span className="text-muted-foreground ml-2">— {o.status}</span>
                        </div>
                        <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[o.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                          {TIPO_PRODUTO_LABELS[o.tipo_produto || ''] || 'A classificar'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Piloto Toggle */}
                {canEdit && (
                  <div className="rounded-lg border border-border/60 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Marcar como Piloto</Label>
                      <Switch
                        checked={detail.pedido.is_piloto || false}
                        onCheckedChange={async (checked) => {
                          await supabase.from('pedidos').update({ is_piloto: checked, status_piloto: checked ? 'ENVIADO' : null }).eq('id', detail.pedido.id);
                          toast.success(checked ? 'Marcado como piloto' : 'Piloto removido');
                          openDetail(detail.pedido.id);
                          fetchAll();
                        }}
                      />
                    </div>
                    {detail.pedido.is_piloto && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Select value={detail.pedido.status_piloto || 'ENVIADO'} onValueChange={async (v) => {
                            const update: any = { status_piloto: v };
                            if (v === 'REPROVADO' && !detail.pedido.observacao_piloto) {
                              toast.error('Preencha o motivo da reprovação antes');
                              return;
                            }
                            await supabase.from('pedidos').update(update).eq('id', detail.pedido.id);
                            await supabase.from('pedido_historico').insert({
                              pedido_id: detail.pedido.id, usuario_id: profile!.id, tipo_acao: 'EDICAO',
                              observacao: `Piloto ${v === 'APROVADO' ? 'aprovado' : v === 'REPROVADO' ? 'reprovado' : 'enviado'} por ${profile!.nome}`,
                            });
                            toast.success(`Piloto marcado como ${v}`);
                            openDetail(detail.pedido.id);
                            fetchAll();
                          }}>
                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ENVIADO">Enviado</SelectItem>
                              <SelectItem value="APROVADO">Aprovado</SelectItem>
                              <SelectItem value="REPROVADO">Reprovado</SelectItem>
                            </SelectContent>
                          </Select>
                          <Badge className={`text-xs self-center ${
                            detail.pedido.status_piloto === 'APROVADO' ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' :
                            detail.pedido.status_piloto === 'REPROVADO' ? 'bg-destructive/15 text-destructive' :
                            'bg-purple-500/15 text-purple-600'
                          }`}>
                            {detail.pedido.status_piloto || 'ENVIADO'}
                          </Badge>
                        </div>
                        <Textarea
                          placeholder="Observação do piloto..."
                          defaultValue={detail.pedido.observacao_piloto || ''}
                          onBlur={async (e) => {
                            if (e.target.value !== (detail.pedido.observacao_piloto || '')) {
                              await supabase.from('pedidos').update({ observacao_piloto: e.target.value }).eq('id', detail.pedido.id);
                            }
                          }}
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Perdas confirmadas */}
                {detail.perdas.filter((p: any) => p.status === 'CONFIRMADA').length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-destructive" /> Perdas Confirmadas</p>
                    {detail.perdas.filter((p: any) => p.status === 'CONFIRMADA').map((p: any) => (
                      <div key={p.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                        <p className="font-medium">{p.nm_item}</p>
                        <div className="flex gap-3 text-muted-foreground mt-1">
                          <span>{p.quantidade_perdida} un perdida{p.quantidade_perdida > 1 ? 's' : ''}</span>
                          <span>Etapa: {p.etapa}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Motivo: {p.motivo}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="itens" className="mt-4">
                <div className="space-y-2">
                  {detail.itens.map((item: any) => (
                    <div key={item.id} className="rounded-lg border border-border/60 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{item.descricao_produto}</p>
                        {item.disponivel === false && (
                          <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] shrink-0">
                            Faltante{item.quantidade_faltante ? ` (${item.quantidade_faltante}/${item.quantidade})` : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-4 text-muted-foreground mt-1">
                        <span>Qtd: {item.quantidade}</span>
                        <span>R$ {item.valor_total?.toFixed(2)}</span>
                        {item.referencia_produto && <span>Ref: {item.referencia_produto}</span>}
                      </div>
                      {item.observacao_producao && <p className="text-xs text-primary mt-1">📝 {item.observacao_producao}</p>}
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="historico" className="mt-4">
                <div className="space-y-2">
                  {detail.historico.map((h: any) => (
                    <div key={h.id} className="rounded-lg border border-border/60 p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">{h.tipo_acao}</span>
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(h.criado_em), { locale: ptBR, addSuffix: true })}</span>
                      </div>
                      {h.observacao && <p className="text-muted-foreground mt-1">{h.observacao}</p>}
                      {h.usuarios?.nome && <p className="text-xs text-muted-foreground mt-0.5">por {h.usuarios.nome}</p>}
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Config Dialog */}
      <ConfigurarPcpDialog open={configOpen} onOpenChange={setConfigOpen} onSaved={fetchAll} />
    </div>
  );
}
