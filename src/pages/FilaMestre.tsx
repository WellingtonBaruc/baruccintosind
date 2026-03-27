import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_PRAZO_CONFIG, TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { STATUS_PEDIDO_CONFIG } from '@/lib/producao';
import { PcpCalendarData, calcularPrazoPcp, isDiaUtil } from '@/lib/pcpCalendario';
import { hojeBrasilia } from '@/lib/dateUtils';
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
import { Search, Loader2, Calendar, AlertTriangle, Settings, CheckCircle2, ChevronDown, ChevronRight, Layers, FileSpreadsheet, FileText, Download, CalendarIcon, LayoutList, LayoutGrid, Clock, Plus, Store, Wrench } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  data_entrega_ajustada_pcp: string | null;
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
  quantidade_itens: number;
  dataPcpCalculada: string | null;
  dataInicioIdeal: string | null;
  atrasoDias: number;
  prioridade: 'URGENTE' | 'ATENCAO' | 'NORMAL';
  etapas: EtapaInfo[];
  dataEntregaEfetiva: string | null;
  origem_op: string | null;
  produtos_descricao: string | null;
}

interface PedidoDetail {
  pedido: any;
  itens: any[];
  historico: any[];
  ordens: any[];
  perdas: any[];
}

type AgrupamentoType = 'data_entrega' | 'tipo' | 'status';
type ViewMode = 'compact' | 'detailed';

interface GrupoInfo {
  key: string;
  label: string;
  pedidos: VendaRow[];
  totalPecas: number;
  totalValor: number;
  urgentes: number;
  sinteticoCount: number;
  sinteticoPecas: number;
  tecidoCount: number;
  tecidoPecas: number;
  outrosCount: number;
  outrosPecas: number;
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
  const [agrupamento, setAgrupamento] = useState<AgrupamentoType>('data_entrega');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [exportDateFrom, setExportDateFrom] = useState<Date | undefined>();
  const [exportDateTo, setExportDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [selectedPlanDay, setSelectedPlanDay] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth());
  const [selectedWeek, setSelectedWeek] = useState<number>(0); // 0 = todas
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<string | null>(null);
  const [weekSummary, setWeekSummary] = useState<{ sintetico: number; tecido: number; concluido: number }>({ sintetico: 0, tecido: 0, concluido: 0 });
  const [dailySummary, setDailySummary] = useState<Record<string, { sintetico: number; tecido: number; concluido: number }>>({});

  const [calendarData, setCalendarData] = useState<PcpCalendarData>({ sabadoAtivo: false, domingoAtivo: false, feriados: [], pausas: [] });
  const [leadTimes, setLeadTimes] = useState<Record<string, number>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PedidoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editingPcp, setEditingPcp] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Gerar OP PCP dialog state
  const [gerarOpDialogOpen, setGerarOpDialogOpen] = useState(false);
  const [gerarOpPedidoId, setGerarOpPedidoId] = useState<string | null>(null);
  const [gerarOpTipo, setGerarOpTipo] = useState<string>('SINTETICO');
  const [gerarOpObs, setGerarOpObs] = useState('');
  const [gerarOpLoading, setGerarOpLoading] = useState(false);
  const [gerarOpItens, setGerarOpItens] = useState<any[]>([]);
  const [gerarOpItensSelecionados, setGerarOpItensSelecionados] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetchAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchAll(), 1500);
  }, []);

  useEffect(() => {
    fetchAll();
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

  const fetchWeeklySummary = useCallback(async (month: number, weekNum: number) => {
    const currentYear = new Date().getFullYear();
    const daysInMonth = new Date(currentYear, month + 1, 0).getDate();

    let dateFrom: string, dateTo: string;
    if (weekNum === 0) {
      dateFrom = `${currentYear}-${String(month + 1).padStart(2, '0')}-01`;
      dateTo = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    } else {
      const weekStart = (weekNum - 1) * 7 + 1;
      const weekEnd = Math.min(weekNum * 7, daysInMonth);
      dateFrom = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(weekStart).padStart(2, '0')}`;
      dateTo = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(weekEnd).padStart(2, '0')}`;
    }

    // Fetch pedidos with adjusted delivery in range
    const { data: pedidosAjustados } = await supabase
      .from('pedidos')
      .select('id')
      .gte('data_entrega_ajustada_pcp', dateFrom)
      .lte('data_entrega_ajustada_pcp', dateTo);

    // Fetch pedidos without adjusted date, using previsao
    const { data: pedidosPrevisao } = await supabase
      .from('pedidos')
      .select('id')
      .is('data_entrega_ajustada_pcp', null)
      .gte('data_previsao_entrega', dateFrom)
      .lte('data_previsao_entrega', dateTo);

    const pedidoIds = [...new Set([
      ...(pedidosAjustados || []).map(p => p.id),
      ...(pedidosPrevisao || []).map(p => p.id),
    ])];

    if (pedidoIds.length === 0) {
      setWeekSummary({ sintetico: 0, tecido: 0, concluido: 0 });
      return;
    }

    // Fetch orders (only SINTETICO/TECIDO - exclude OUTROS) and items in batches
    const batchSize = 200;
    const allOrdens: any[] = [];
    const allItens: any[] = [];
    for (let i = 0; i < pedidoIds.length; i += batchSize) {
      const batch = pedidoIds.slice(i, i + batchSize);
      const [ordensRes, itensRes] = await Promise.all([
        supabase.from('ordens_producao')
          .select('id, pedido_id, tipo_produto, status, data_fim_pcp')
          .in('pedido_id', batch)
          .in('tipo_produto', ['SINTETICO', 'TECIDO']),
        supabase.from('pedido_itens').select('pedido_id, quantidade').in('pedido_id', batch),
      ]);
      allOrdens.push(...(ordensRes.data || []));
      allItens.push(...(itensRes.data || []));
    }

    // Only count pedidos that have valid production orders
    const pedidoIdsWithOrdens = new Set(allOrdens.map(o => o.pedido_id));

    const qtdByPedido = new Map<string, number>();
    for (const item of allItens) {
      if (!pedidoIdsWithOrdens.has(item.pedido_id)) continue;
      qtdByPedido.set(item.pedido_id, (qtdByPedido.get(item.pedido_id) || 0) + (item.quantidade || 0));
    }

    const ordensByPedido = new Map<string, any[]>();
    for (const o of allOrdens) {
      if (!ordensByPedido.has(o.pedido_id)) ordensByPedido.set(o.pedido_id, []);
      ordensByPedido.get(o.pedido_id)!.push(o);
    }

    let totalSint = 0, totalTec = 0, totalConcl = 0;
    const fromDay = parseInt(dateFrom.split('-')[2]);
    const toDay = parseInt(dateTo.split('-')[2]);

    for (const [pedidoId, ordens] of ordensByPedido) {
      const pecas = qtdByPedido.get(pedidoId) || 0;
      const mainOrdem = ordens.find((o: any) => o.tipo_produto === 'SINTETICO') || ordens.find((o: any) => o.tipo_produto === 'TECIDO');
      if (!mainOrdem) continue;
      if (mainOrdem.tipo_produto === 'SINTETICO') totalSint += pecas;
      else if (mainOrdem.tipo_produto === 'TECIDO') totalTec += pecas;

      const concluded = ordens.some((o: any) => {
        if (o.status !== 'CONCLUIDA' || !o.data_fim_pcp) return false;
        const fimDate = new Date(o.data_fim_pcp);
        return fimDate.getFullYear() === currentYear && fimDate.getMonth() === month && fimDate.getDate() >= fromDay && fimDate.getDate() <= toDay;
      });
      if (concluded) totalConcl += pecas;
    }
    setWeekSummary({ sintetico: totalSint, tecido: totalTec, concluido: totalConcl });
  }, []);

  const fetchDailySummary = useCallback(async (days: string[]) => {
    if (days.length === 0) return;
    const dateFrom = days[0];
    const dateTo = days[days.length - 1];

    const [ajRes, prevRes] = await Promise.all([
      supabase.from('pedidos').select('id, data_entrega_ajustada_pcp').gte('data_entrega_ajustada_pcp', dateFrom).lte('data_entrega_ajustada_pcp', dateTo),
      supabase.from('pedidos').select('id, data_previsao_entrega').is('data_entrega_ajustada_pcp', null).gte('data_previsao_entrega', dateFrom).lte('data_previsao_entrega', dateTo),
    ]);
    const pedidoDateMap = new Map<string, string>();
    for (const p of (ajRes.data || [])) pedidoDateMap.set(p.id, p.data_entrega_ajustada_pcp);
    for (const p of (prevRes.data || [])) pedidoDateMap.set(p.id, p.data_previsao_entrega);

    const pedidoIds = [...pedidoDateMap.keys()];
    if (pedidoIds.length === 0) { setDailySummary({}); return; }

    const batchSize = 200;
    const allOrdens: any[] = [];
    const allItens: any[] = [];
    for (let i = 0; i < pedidoIds.length; i += batchSize) {
      const batch = pedidoIds.slice(i, i + batchSize);
      const [oRes, iRes] = await Promise.all([
        supabase.from('ordens_producao').select('id, pedido_id, tipo_produto, status, data_fim_pcp').in('pedido_id', batch).in('tipo_produto', ['SINTETICO', 'TECIDO']),
        supabase.from('pedido_itens').select('pedido_id, quantidade').in('pedido_id', batch),
      ]);
      allOrdens.push(...(oRes.data || []));
      allItens.push(...(iRes.data || []));
    }

    const pedidoIdsWithOrdens = new Set(allOrdens.map(o => o.pedido_id));
    const qtdByPedido = new Map<string, number>();
    for (const item of allItens) {
      if (!pedidoIdsWithOrdens.has(item.pedido_id)) continue;
      qtdByPedido.set(item.pedido_id, (qtdByPedido.get(item.pedido_id) || 0) + (item.quantidade || 0));
    }
    const ordensByPedido = new Map<string, any[]>();
    for (const o of allOrdens) {
      if (!ordensByPedido.has(o.pedido_id)) ordensByPedido.set(o.pedido_id, []);
      ordensByPedido.get(o.pedido_id)!.push(o);
    }

    const result: Record<string, { sintetico: number; tecido: number; concluido: number }> = {};
    for (const day of days) result[day] = { sintetico: 0, tecido: 0, concluido: 0 };

    for (const [pedidoId, ordens] of ordensByPedido) {
      const deliveryDate = pedidoDateMap.get(pedidoId);
      if (!deliveryDate || !result[deliveryDate]) continue;
      const pecas = qtdByPedido.get(pedidoId) || 0;
      const mainOrdem = ordens.find((o: any) => o.tipo_produto === 'SINTETICO') || ordens.find((o: any) => o.tipo_produto === 'TECIDO');
      if (!mainOrdem) continue;
      if (mainOrdem.tipo_produto === 'SINTETICO') result[deliveryDate].sintetico += pecas;
      else result[deliveryDate].tecido += pecas;

      const concluded = ordens.some((o: any) => {
        if (o.status !== 'CONCLUIDA' || !o.data_fim_pcp) return false;
        const fimStr = new Date(o.data_fim_pcp).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        return fimStr === deliveryDate;
      });
      if (concluded) result[deliveryDate].concluido += pecas;
    }
    setDailySummary(result);
  }, []);

  useEffect(() => {
    fetchWeeklySummary(selectedMonth, selectedWeek);
  }, [selectedMonth, selectedWeek, fetchWeeklySummary]);

  const computeNext5Days = useCallback((cal: PcpCalendarData) => {
    const todayStr = hojeBrasilia();
    const today = new Date(todayStr + 'T00:00:00');
    const next5: string[] = [];
    const cursor = new Date(today);
    if (isDiaUtil(cursor, cal)) next5.push(todayStr);
    while (next5.length < 5) {
      cursor.setDate(cursor.getDate() + 1);
      if (isDiaUtil(cursor, cal)) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getDate()).padStart(2, '0');
        next5.push(`${y}-${m}-${dd}`);
      }
    }
    return next5;
  }, []);

  const fetchAll = async () => {
    const { cal, lts } = await fetchCalendarData();
    await fetchRows(cal, lts);
    fetchWeeklySummary(selectedMonth, selectedWeek);
    const days = computeNext5Days(cal);
    fetchDailySummary(days);
  };

  const fetchRows = async (cal: PcpCalendarData, lts: Record<string, number>) => {
    const { data: pedidosEmProducao } = await supabase
      .from('pedidos')
      .select('id, api_venda_id, numero_pedido, cliente_nome, valor_liquido, data_venda_api, data_previsao_entrega, data_entrega_ajustada_pcp, status_atual, status_prazo, status_api, observacao_api, criado_em, is_piloto, status_piloto, fivelas_separadas')
      .eq('status_api', 'Em Produção')
      .order('criado_em', { ascending: false });

    const { data: todasOrdens } = await supabase
      .from('ordens_producao')
      .select('id, pedido_id, tipo_produto, status, data_inicio_pcp, data_fim_pcp, sequencia')
      .not('status', 'in', '("CONCLUIDA","CANCELADA")');

    const emProducaoIds = new Set((pedidosEmProducao || []).map(p => p.id));
    const complementaryOpPedidoIds = new Set<string>();
    for (const o of (todasOrdens || [])) {
      if ((o as any).sequencia > 1 && !emProducaoIds.has(o.pedido_id)) {
        complementaryOpPedidoIds.add(o.pedido_id);
      }
    }
    const backfillIds = [...complementaryOpPedidoIds];

    let pedidosComOp: any[] = [];
    if (backfillIds.length > 0) {
      const { data } = await supabase
        .from('pedidos')
        .select('id, api_venda_id, numero_pedido, cliente_nome, valor_liquido, data_venda_api, data_previsao_entrega, data_entrega_ajustada_pcp, status_atual, status_prazo, status_api, observacao_api, criado_em, is_piloto, status_piloto, fivelas_separadas')
        .in('id', backfillIds)
        .not('status_atual', 'in', '("HISTORICO","CANCELADO","FINALIZADO_SIMPLIFICA")');
      pedidosComOp = data || [];
    }

    const pedidos = [...(pedidosEmProducao || []), ...pedidosComOp];
    if (pedidos.length === 0) { setRows([]); setLoading(false); return; }

    const pedidoIds = pedidos.map(p => p.id);

    const [ordensRes, itensRes] = await Promise.all([
      supabase.from('ordens_producao').select('id, pedido_id, tipo_produto, status, data_inicio_pcp, data_fim_pcp, origem_op, produtos_descricao').in('pedido_id', pedidoIds),
      supabase.from('pedido_itens').select('pedido_id, quantidade').in('pedido_id', pedidoIds),
    ]);
    const ordens = ordensRes.data || [];
    const itensData = itensRes.data || [];

    // Aggregate quantities per pedido
    const qtdMap = new Map<string, number>();
    for (const item of itensData) {
      qtdMap.set(item.pedido_id, (qtdMap.get(item.pedido_id) || 0) + (item.quantidade || 0));
    }

    const ordemIds = ordens.map(o => o.id);
    const { data: etapas } = await supabase
      .from('op_etapas')
      .select('id, ordem_id, nome_etapa, operador_id, status, ordem_sequencia, usuarios(nome)')
      .in('ordem_id', ordemIds.length > 0 ? ordemIds : ['none'])
      .order('ordem_sequencia', { ascending: true });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const vendas: VendaRow[] = pedidos.map(p => {
      // Priorizar OP principal (não-OUTROS) e ativa (EM_ANDAMENTO > AGUARDANDO)
      const ordensDoPedido = ordens.filter(o => o.pedido_id === p.id);
      const ordem = ordensDoPedido.find(o => o.status === 'EM_ANDAMENTO' && o.tipo_produto !== 'OUTROS')
        || ordensDoPedido.find(o => o.status === 'AGUARDANDO' && o.tipo_produto !== 'OUTROS')
        || ordensDoPedido.find(o => o.status === 'EM_ANDAMENTO')
        || ordensDoPedido.find(o => o.status === 'AGUARDANDO')
        || ordensDoPedido[0] || null;
      const allOrdemEtapas = ordem ? (etapas || []).filter(e => e.ordem_id === ordem.id) : [];
      
      // Build unified trail for TECIDO: Tecido etapas + Sintético etapas (Preparação→Montagem→Embalagem)
      let unifiedEtapas: EtapaInfo[] = allOrdemEtapas.map((e: any) => ({ id: e.id, nome_etapa: e.nome_etapa, ordem_sequencia: e.ordem_sequencia, status: e.status }));
      
      const tipoProduto = ordem?.tipo_produto || null;
      
      if (tipoProduto === 'TECIDO') {
        // TECIDO must always show 8 stages: Conferência→Fusionagem→Colagem/Viração→Finalização→Preparação→Montagem→Embalagem→Concluído
        const tecidoFullTrail = [
          'Conferência', 'Fusionagem', 'Colagem / Viração', 'Finalização',
          'Preparação', 'Montagem', 'Embalagem', 'Concluído'
        ];
        
        // Map real etapas by normalized name
        const realEtapasMap = new Map<string, EtapaInfo>();
        for (const e of unifiedEtapas) {
          const norm = e.nome_etapa.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          realEtapasMap.set(norm, e);
        }
        // Also check Sintético OP etapas if they exist
        const sinteticoOrdem = ordensDoPedido.find(o => o.tipo_produto === 'SINTETICO');
        if (sinteticoOrdem) {
          const sinEtapas = (etapas || []).filter((e: any) => e.ordem_id === sinteticoOrdem.id);
          for (const e of sinEtapas) {
            const norm = (e as any).nome_etapa.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            realEtapasMap.set(norm, { id: (e as any).id, nome_etapa: (e as any).nome_etapa, ordem_sequencia: (e as any).ordem_sequencia, status: (e as any).status });
          }
        }
        // Also map "Produção Finalizada" → "Concluído"
        if (realEtapasMap.has('producao finalizada') && !realEtapasMap.has('concluido')) {
          const pf = realEtapasMap.get('producao finalizada')!;
          realEtapasMap.set('concluido', { ...pf, nome_etapa: 'Concluído' });
        }

        unifiedEtapas = tecidoFullTrail
          .filter((name) => name !== 'Concluído')
          .map((name, idx) => {
            const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const real = realEtapasMap.get(norm);
            if (real) {
              return { id: real.id, nome_etapa: name, ordem_sequencia: idx, status: real.status };
            }
            // For stages without real etapa (Preparação/Montagem/Embalagem), show PENDENTE
            return { id: `virtual-${idx}`, nome_etapa: name, ordem_sequencia: idx, status: 'PENDENTE' };
          });
      }

      // Find active etapa across unified trail
      const etapaAtiva = unifiedEtapas.find(e => e.status === 'EM_ANDAMENTO') || unifiedEtapas.find(e => e.status === 'PENDENTE') || null;

      let etapaDisplay = '—';
      if (ordem) {
        if (ordem.status === 'AGUARDANDO') etapaDisplay = 'Aguardando Início';
        else if (ordem.status === 'CONCLUIDA') {
          // For TECIDO, check if Sintético OP is still active
          const sinteticoOrdem = tipoProduto === 'TECIDO' ? ordensDoPedido.find(o => o.tipo_produto === 'SINTETICO') : null;
          if (sinteticoOrdem && sinteticoOrdem.status !== 'CONCLUIDA') {
            const sinEtapaAtiva = (etapas || []).filter((e: any) => e.ordem_id === sinteticoOrdem.id).find((e: any) => e.status === 'EM_ANDAMENTO');
            etapaDisplay = sinEtapaAtiva ? sinEtapaAtiva.nome_etapa : 'Em Andamento';
          } else {
            etapaDisplay = 'Concluída';
          }
        }
        else if (etapaAtiva) etapaDisplay = etapaAtiva.nome_etapa;
        else etapaDisplay = ordem.status;
      }

      const lt = lts[tipoProduto || ''] ?? 5;
      const dataEntregaEfetiva = (p as any).data_entrega_ajustada_pcp || p.data_previsao_entrega;
      const pcp = calcularPrazoPcp(dataEntregaEfetiva, lt, cal, new Date(today));

      const ATENCAO_DIAS = 3;
      let statusPrazo = 'NO_PRAZO';
      if (dataEntregaEfetiva) {
        const previsao = new Date(dataEntregaEfetiva + 'T00:00:00');
        const diffMs = previsao.getTime() - today.getTime();
        const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDias < 0) statusPrazo = 'ATRASADO';
        else if (diffDias <= ATENCAO_DIAS) statusPrazo = 'ATENCAO';
      }

      // Determine overall ordem_status considering both OPs for TECIDO
      let overallOrdemStatus = ordem?.status || null;
      if (tipoProduto === 'TECIDO' && ordem?.status === 'CONCLUIDA') {
        const sinteticoOrdem = ordensDoPedido.find(o => o.tipo_produto === 'SINTETICO');
        if (sinteticoOrdem && sinteticoOrdem.status !== 'CONCLUIDA') {
          overallOrdemStatus = sinteticoOrdem.status;
        }
      }

      return {
        ...p,
        ordem_id: ordem?.id || null,
        ordem_status: overallOrdemStatus,
        tipo_produto: tipoProduto,
        etapa_atual: etapaDisplay,
        operador_atual: (etapaAtiva as any)?.usuarios?.nome || (allOrdemEtapas.find((e: any) => e.status === 'EM_ANDAMENTO')?.usuarios as any)?.nome || '—',
        data_inicio_pcp: (ordem as any)?.data_inicio_pcp || null,
        data_fim_pcp: (ordem as any)?.data_fim_pcp || null,
        is_piloto: (p as any).is_piloto || false,
        status_piloto: (p as any).status_piloto || null,
        fivelas_separadas: (p as any).fivelas_separadas || false,
        observacao_api: (p as any).observacao_api || null,
        data_entrega_ajustada_pcp: (p as any).data_entrega_ajustada_pcp || null,
        status_prazo: statusPrazo,
        quantidade_itens: qtdMap.get(p.id) || 0,
        dataPcpCalculada: pcp.dataPcpCalculada,
        dataInicioIdeal: pcp.dataInicioIdeal,
        atrasoDias: pcp.atrasoDias,
        prioridade: pcp.prioridade,
        etapas: unifiedEtapas,
        dataEntregaEfetiva,
        origem_op: (ordem as any)?.origem_op || 'SISTEMA',
        produtos_descricao: (ordem as any)?.produtos_descricao || null,
      };
    });

    setRows(vendas);
    setLoading(false);
  };

  const handleMoveToEtapa = async (row: VendaRow, targetEtapa: EtapaInfo) => {
    if (!profile || !['admin', 'gestor'].includes(profile.perfil)) return;
    if (!row.ordem_id) return;
    const etapas = row.etapas || [];
    for (const etapa of etapas) {
      let newStatus: string;
      if (etapa.ordem_sequencia < targetEtapa.ordem_sequencia) newStatus = 'CONCLUIDA';
      else if (etapa.ordem_sequencia === targetEtapa.ordem_sequencia) newStatus = 'EM_ANDAMENTO';
      else newStatus = 'PENDENTE';
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

  const saveEntregaAjustada = async (pedidoId: string, date: Date | undefined) => {
    const value = date ? format(date, 'yyyy-MM-dd') : null;
    await supabase.from('pedidos').update({ data_entrega_ajustada_pcp: value } as any).eq('id', pedidoId);
    toast.success(value ? `Entrega ajustada para ${format(date!, 'dd/MM/yy')}` : 'Entrega ajustada removida');
    fetchAll();
  };
  // Open Gerar OP PCP dialog
  const openGerarOpDialog = async (pedidoId: string) => {
    setGerarOpPedidoId(pedidoId);
    setGerarOpTipo('SINTETICO');
    setGerarOpObs('');
    setGerarOpItensSelecionados(new Set());
    // Fetch items for this pedido
    const { data: itens } = await supabase.from('pedido_itens').select('*').eq('pedido_id', pedidoId);
    setGerarOpItens(itens || []);
    setGerarOpItensSelecionados(new Set((itens || []).map((i: any) => i.id)));
    setGerarOpDialogOpen(true);
  };

  const handleGerarOpPcp = async () => {
    if (!profile || !gerarOpPedidoId) return;
    setGerarOpLoading(true);
    try {
      // Determine pipeline based on tipo
      const pipelineMap: Record<string, string> = {
        'SINTETICO': '00000000-0000-0000-0000-000000000001',
        'TECIDO': '00000000-0000-0000-0000-000000000002',
        'FIVELA_COBERTA': '00000000-0000-0000-0000-000000000003',
      };
      const pipelineId = pipelineMap[gerarOpTipo] || pipelineMap['SINTETICO'];

      // Get max sequencia for this pedido
      const { data: existingOrdens } = await supabase
        .from('ordens_producao')
        .select('sequencia')
        .eq('pedido_id', gerarOpPedidoId)
        .order('sequencia', { ascending: false })
        .limit(1);
      const nextSeq = (existingOrdens && existingOrdens[0] ? existingOrdens[0].sequencia : 0) + 1;

      // Build product description
      const selectedItens = gerarOpItens.filter(i => gerarOpItensSelecionados.has(i.id));
      const prodDesc = selectedItens.map((i: any) => `${i.descricao_produto} (${i.quantidade}un)`).join(', ');

      // Create OP
      const { data: novaOrdem, error: ordemErr } = await supabase
        .from('ordens_producao')
        .insert({
          pedido_id: gerarOpPedidoId,
          pipeline_id: pipelineId,
          sequencia: nextSeq,
          status: 'AGUARDANDO',
          tipo_produto: gerarOpTipo,
          observacao: gerarOpObs || null,
          origem_op: 'PCP',
          criado_por_id: profile.id,
          produtos_descricao: prodDesc || null,
        } as any)
        .select()
        .single();
      if (ordemErr) throw ordemErr;

      // Create etapas
      const { data: etapas } = await supabase
        .from('pipeline_etapas')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('ordem');

      if (etapas && etapas.length > 0 && novaOrdem) {
        const opEtapas = etapas.map((e: any) => ({
          ordem_id: novaOrdem.id,
          pipeline_etapa_id: e.id,
          nome_etapa: e.nome,
          ordem_sequencia: e.ordem,
          status: 'PENDENTE',
        }));
        await supabase.from('op_etapas').insert(opEtapas as any);
      }

      // Register history
      await supabase.from('pedido_historico').insert({
        pedido_id: gerarOpPedidoId,
        usuario_id: profile.id,
        tipo_acao: 'TRANSICAO',
        observacao: `OP de Produção gerada pelo PCP. Tipo: ${gerarOpTipo}. ${gerarOpObs ? 'Obs: ' + gerarOpObs : ''}`,
      });

      toast.success('OP PCP gerada com sucesso!');
      setGerarOpDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error('Erro ao gerar OP: ' + (err.message || err));
    } finally {
      setGerarOpLoading(false);
    }
  };


  const filtered = rows.filter(r => {
    if (search && !r.cliente_nome.toLowerCase().includes(search.toLowerCase()) && !r.numero_pedido.toLowerCase().includes(search.toLowerCase()) && !(r.api_venda_id || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (tipoFilter !== 'all' && r.tipo_produto !== tipoFilter) return false;
    if (statusFilter !== 'all' && r.status_atual !== statusFilter) return false;
    if (prazoFilter === 'ATRASADO' && r.status_prazo !== 'ATRASADO') return false;
    if (prazoFilter === 'HOJE' && r.dataEntregaEfetiva !== new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })) return false;
    if (prazoFilter === 'FUTURO' && (r.status_prazo === 'ATRASADO' || r.dataEntregaEfetiva === new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }))) return false;
    if (selectedPlanDay && r.dataEntregaEfetiva !== selectedPlanDay) return false;
    if (selectedWeekFilter && r.dataEntregaEfetiva) {
      const d = new Date(r.dataEntregaEfetiva + 'T00:00:00');
      const weekNum = Math.ceil(d.getDate() / 7);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      if (selectedWeekFilter !== `${monthKey}-${weekNum}`) return false;
    }
    return true;
  });

  const prioOrder: Record<string, number> = { URGENTE: 0, ATENCAO: 1, NORMAL: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const pa = prioOrder[a.prioridade] ?? 3;
    const pb = prioOrder[b.prioridade] ?? 3;
    if (pa !== pb) return pa - pb;
    const dA = a.dataEntregaEfetiva || '9999-12-31';
    const dB = b.dataEntregaEfetiva || '9999-12-31';
    if (dA !== dB) return dA.localeCompare(dB);
    return a.atrasoDias - b.atrasoDias;
  });

  // Grouping
  const buildGroups = (items: VendaRow[]): GrupoInfo[] => {
    const map = new Map<string, VendaRow[]>();
    for (const r of items) {
      let key: string;
      if (agrupamento === 'data_entrega') {
        key = r.dataEntregaEfetiva || 'SEM_DATA';
      } else if (agrupamento === 'tipo') {
        key = r.tipo_produto || 'SEM_TIPO';
      } else {
        key = r.status_atual || 'SEM_STATUS';
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }

    const groups: GrupoInfo[] = [];
    for (const [key, pedidos] of map.entries()) {
      let label: string;
      if (agrupamento === 'data_entrega') {
        if (key === 'SEM_DATA') label = 'Sem data de entrega';
        else {
          try {
            label = format(new Date(key + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
          } catch { label = key; }
        }
      } else if (agrupamento === 'tipo') {
        label = TIPO_PRODUTO_LABELS[key] || key;
      } else {
        label = (STATUS_PEDIDO_CONFIG[key] || {}).label || key;
      }

      const sinteticos = pedidos.filter(p => p.tipo_produto === 'SINTETICO');
      const tecidos = pedidos.filter(p => p.tipo_produto === 'TECIDO');
      const outros = pedidos.filter(p => p.tipo_produto !== 'SINTETICO' && p.tipo_produto !== 'TECIDO');

      groups.push({
        key,
        label,
        pedidos,
        totalPecas: pedidos.reduce((s, p) => s + p.quantidade_itens, 0),
        totalValor: pedidos.reduce((s, p) => s + p.valor_liquido, 0),
        urgentes: pedidos.filter(p => p.prioridade === 'URGENTE').length,
        sinteticoCount: sinteticos.length,
        sinteticoPecas: sinteticos.reduce((s, p) => s + p.quantidade_itens, 0),
        tecidoCount: tecidos.length,
        tecidoPecas: tecidos.reduce((s, p) => s + p.quantidade_itens, 0),
        outrosCount: outros.length,
        outrosPecas: outros.reduce((s, p) => s + p.quantidade_itens, 0),
      });
    }

    // Sort groups
    if (agrupamento === 'data_entrega') {
      groups.sort((a, b) => {
        if (a.key === 'SEM_DATA') return 1;
        if (b.key === 'SEM_DATA') return -1;
        return a.key.localeCompare(b.key);
      });
    }

    return groups;
  };

  const groups = buildGroups(sorted);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Intelligence bar stats
  const tipoStats = Object.entries(leadTimes)
    .filter(([tipo]) => tipo !== 'FIVELA_COBERTA')
    .map(([tipo, lt]) => {
      const tipoRows = rows.filter(r => r.tipo_produto === tipo);
      const emProducao = tipoRows.filter(r => r.status_atual === 'EM_PRODUCAO').length;
      const emFila = tipoRows.filter(r => r.status_atual === 'AGUARDANDO_PRODUCAO').length;
      const atrasados = tipoRows.filter(r => r.prioridade === 'URGENTE');
      const atrasoMedio = atrasados.length > 0 ? atrasados.reduce((s, r) => s + Math.abs(r.atrasoDias), 0) / atrasados.length : 0;
      return { tipo, tipoLabel: TIPO_PRODUTO_LABELS[tipo] || tipo, leadTime: lt, emProducao, emFila, atrasoMedio };
    });

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string | null) => d ? format(new Date(d + 'T00:00:00'), 'dd/MM/yy') : '—';

  const exportGroupToExcel = (group: GrupoInfo) => {
    const data = group.pedidos.map(r => ({
      'Venda': r.api_venda_id || r.numero_pedido,
      'Cliente': r.cliente_nome,
      'Tipo': TIPO_PRODUTO_LABELS[r.tipo_produto || ''] || 'A classificar',
      'Status': (STATUS_PEDIDO_CONFIG[r.status_atual] || {}).label || r.status_atual,
      'Valor': r.valor_liquido,
      'Qtd Itens': r.quantidade_itens,
      'Data Venda': r.data_venda_api || '',
      'Entrega Original': r.data_previsao_entrega || '',
      'Entrega Ajustada': r.data_entrega_ajustada_pcp || '',
      'Início Ideal': r.dataInicioIdeal || '',
      'Início PCP': r.data_inicio_pcp || '',
      'Fim PCP': r.data_fim_pcp || '',
      'Atraso (dias)': r.atrasoDias,
      'Prioridade': r.prioridade,
      'Etapa Atual': r.etapa_atual,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fila');
    XLSX.writeFile(wb, `fila_mestre_${group.key.replace(/\s/g, '_')}.xlsx`);
    toast.success('Excel exportado com sucesso');
  };

  const exportGroupToPdf = (group: GrupoInfo) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`Fila Mestre — ${group.label}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`${group.pedidos.length} pedidos · ${group.totalPecas} peças · ${fmt(group.totalValor)} · ${group.urgentes} urgente(s)`, 14, 22);

    const head = [['Venda', 'Cliente', 'Tipo', 'Status', 'Valor', 'Entrega', 'Atraso', 'Etapa Atual']];
    const body = group.pedidos.map(r => [
      r.api_venda_id || r.numero_pedido,
      r.cliente_nome,
      TIPO_PRODUTO_LABELS[r.tipo_produto || ''] || '—',
      (STATUS_PEDIDO_CONFIG[r.status_atual] || {}).label || r.status_atual,
      fmt(r.valor_liquido),
      fmtDate(r.data_previsao_entrega),
      `${r.atrasoDias}d`,
      r.etapa_atual,
    ]);

    autoTable(doc, {
      startY: 26,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 51, 51], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    doc.save(`fila_mestre_${group.key.replace(/\s/g, '_')}.pdf`);
    toast.success('PDF exportado com sucesso');
  };

  const getFilteredByDate = () => {
    let items = sorted;
    if (exportDateFrom) {
      const from = format(exportDateFrom, 'yyyy-MM-dd');
      items = items.filter(r => (r.dataEntregaEfetiva || '') >= from);
    }
    if (exportDateTo) {
      const to = format(exportDateTo, 'yyyy-MM-dd');
      items = items.filter(r => (r.dataEntregaEfetiva || '') <= to);
    }
    return items;
  };

  const exportAllToExcel = () => {
    const items = getFilteredByDate();
    if (!items.length) { toast.error('Nenhum pedido para exportar'); return; }
    const data = items.map(r => ({
      'Venda': r.api_venda_id || r.numero_pedido,
      'Cliente': r.cliente_nome,
      'Tipo': TIPO_PRODUTO_LABELS[r.tipo_produto || ''] || 'A classificar',
      'Status': (STATUS_PEDIDO_CONFIG[r.status_atual] || {}).label || r.status_atual,
      'Valor': r.valor_liquido,
      'Qtd Itens': r.quantidade_itens,
      'Data Venda': r.data_venda_api || '',
      'Entrega Original': r.data_previsao_entrega || '',
      'Entrega Ajustada': r.data_entrega_ajustada_pcp || '',
      'Início Ideal': r.dataInicioIdeal || '',
      'Início PCP': r.data_inicio_pcp || '',
      'Fim PCP': r.data_fim_pcp || '',
      'Atraso (dias)': r.atrasoDias,
      'Prioridade': r.prioridade,
      'Etapa Atual': r.etapa_atual,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fila Mestre');
    const suffix = exportDateFrom || exportDateTo
      ? `_${exportDateFrom ? format(exportDateFrom, 'ddMMyy') : ''}${exportDateTo ? '_a_' + format(exportDateTo, 'ddMMyy') : ''}`
      : '_geral';
    XLSX.writeFile(wb, `fila_mestre${suffix}.xlsx`);
    toast.success(`Excel exportado — ${items.length} pedidos`);
  };

  const exportAllToPdf = () => {
    const items = getFilteredByDate();
    if (!items.length) { toast.error('Nenhum pedido para exportar'); return; }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const totalVal = items.reduce((s, r) => s + r.valor_liquido, 0);
    const totalPecas = items.reduce((s, r) => s + r.quantidade_itens, 0);
    const urgentes = items.filter(r => r.prioridade === 'URGENTE').length;
    const rangeLabel = exportDateFrom || exportDateTo
      ? `${exportDateFrom ? format(exportDateFrom, 'dd/MM/yy') : '...'} até ${exportDateTo ? format(exportDateTo, 'dd/MM/yy') : '...'}`
      : 'Geral';
    doc.setFontSize(14);
    doc.text(`Fila Mestre — ${rangeLabel}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`${items.length} pedidos · ${totalPecas} peças · ${fmt(totalVal)} · ${urgentes} urgente(s)`, 14, 22);

    const head = [['Venda', 'Cliente', 'Tipo', 'Status', 'Valor', 'Entrega', 'Atraso', 'Etapa Atual']];
    const body = items.map(r => [
      r.api_venda_id || r.numero_pedido,
      r.cliente_nome,
      TIPO_PRODUTO_LABELS[r.tipo_produto || ''] || '—',
      (STATUS_PEDIDO_CONFIG[r.status_atual] || {}).label || r.status_atual,
      fmt(r.valor_liquido),
      fmtDate(r.data_previsao_entrega),
      `${r.atrasoDias}d`,
      r.etapa_atual,
    ]);

    autoTable(doc, {
      startY: 26,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 51, 51], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    const suffix = exportDateFrom || exportDateTo
      ? `_${exportDateFrom ? format(exportDateFrom, 'ddMMyy') : ''}${exportDateTo ? '_a_' + format(exportDateTo, 'ddMMyy') : ''}`
      : '_geral';
    doc.save(`fila_mestre${suffix}.pdf`);
    toast.success(`PDF exportado — ${items.length} pedidos`);
  };
  const fmtDateTime = (d: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const canEdit = profile && ['admin', 'gestor', 'supervisor_producao'].includes(profile.perfil);
  const isAdmin = profile && ['admin', 'gestor'].includes(profile.perfil);

  const prioConfig: Record<string, { icon: string; color: string; label: string }> = {
    URGENTE: { icon: '🔴', color: 'bg-destructive/15 text-destructive border-destructive/30', label: 'Urgente' },
    ATENCAO: { icon: '🟡', color: 'bg-warning/15 text-warning border-warning/30', label: 'Atenção' },
    NORMAL: { icon: '🟢', color: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30', label: 'Normal' },
  };

  const renderCard = (r: VendaRow) => {
    const tipoBadge = TIPO_PRODUTO_BADGE[r.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border';
    const tipoLabel = TIPO_PRODUTO_LABELS[r.tipo_produto || ''] || 'A classificar';
    const prioCfg = prioConfig[r.prioridade];
    const etapas = r.etapas || [];

    return (
      <Card
        key={r.id}
        className={`border-border/60 shadow-sm cursor-pointer hover:shadow-lg transition-all ${
          r.prioridade === 'URGENTE' ? 'border-l-4 border-l-destructive' :
          r.prioridade === 'ATENCAO' ? 'border-l-4 border-l-warning' :
          'border-l-4 border-l-[hsl(var(--success))]'
        }`}
        onClick={() => openDetail(r.id)}
      >
        <CardContent className="p-0">
          {/* Row 1: Header */}
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-bold text-base tracking-tight">{r.api_venda_id || r.numero_pedido}</span>
              <Badge className={`text-[11px] font-semibold ${prioCfg.color}`}>{prioCfg.icon} {prioCfg.label}</Badge>
              <Badge className={`text-[11px] font-medium ${tipoBadge}`}>{tipoLabel}</Badge>
            </div>
            <span className="text-base font-bold tabular-nums whitespace-nowrap text-foreground">{fmt(r.valor_liquido)}</span>
          </div>

          {/* Row 2: Client name */}
          <div className="px-5 pb-2">
            <p className="text-lg font-bold text-foreground truncate leading-tight">{r.cliente_nome}</p>
          </div>

          {/* Row 3: Status line */}
          <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
            <Badge className={`text-[11px] font-medium ${(STATUS_PEDIDO_CONFIG[r.status_atual] || {}).color || 'bg-muted text-muted-foreground'}`}>
              {(STATUS_PEDIDO_CONFIG[r.status_atual] || {}).label || r.status_atual}
            </Badge>
            {r.status_api && (
              <span className="text-[11px] text-muted-foreground border border-border/60 rounded px-2 py-0.5 font-medium">{r.status_api}</span>
            )}
            {r.ordem_status && (
              <Badge variant="outline" className="text-[11px] font-medium">
                OP: {r.ordem_status === 'AGUARDANDO' ? 'Aguardando' : r.ordem_status === 'EM_ANDAMENTO' ? 'Em Andamento' : r.ordem_status === 'CONCLUIDA' ? 'Concluída' : r.ordem_status}
              </Badge>
            )}
            {r.operador_atual !== '—' && (
              <span className="text-[11px] text-muted-foreground ml-auto">👤 {r.operador_atual}</span>
            )}
          </div>

          {/* Row 4: Dates grid */}
          <div className="px-5 pb-3">
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 p-3 rounded-lg bg-muted/40 border border-border/30">
              <DateCell label="Venda" value={fmtDate(r.data_venda_api)} />
              <DateCell label="Entrega Orig." value={fmtDate(r.data_previsao_entrega)} />
              <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Entrega PCP</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`text-sm font-bold tabular-nums mt-0.5 text-left hover:underline ${r.data_entrega_ajustada_pcp ? 'text-primary' : 'text-muted-foreground'}`}>
                      {r.data_entrega_ajustada_pcp ? fmtDate(r.data_entrega_ajustada_pcp) : '✏️ Ajustar'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-2 border-b border-border flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Ajustar data de entrega</span>
                      {r.data_entrega_ajustada_pcp && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => saveEntregaAjustada(r.id, undefined)}>
                          Remover
                        </Button>
                      )}
                    </div>
                    <CalendarPicker
                      mode="single"
                      selected={r.data_entrega_ajustada_pcp ? new Date(r.data_entrega_ajustada_pcp + 'T00:00:00') : undefined}
                      onSelect={(date) => saveEntregaAjustada(r.id, date)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <DateCell label="Início Ideal" value={fmtDate(r.dataInicioIdeal)} />
              <DateCell label="Início PCP" value={fmtDateTime(r.data_inicio_pcp)} />
              <DateCell label="Fim PCP" value={fmtDateTime(r.data_fim_pcp)} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Atraso</span>
                <span className={`text-sm font-bold tabular-nums mt-0.5 ${
                  r.atrasoDias < 0 ? 'text-destructive' :
                  r.atrasoDias <= 2 ? 'text-warning' :
                  'text-foreground'
                }`}>
                  {r.atrasoDias}d
                </span>
              </div>
            </div>
          </div>

          {/* Row 5: Current stage */}
          <div className="px-5 pb-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Etapa atual</span>
            <span className="text-sm font-bold text-primary">{r.etapa_atual}</span>
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
              <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">📋 Sem data prevista</Badge>
            )}
          </div>

          {/* Row 6: Progress trail */}
          {etapas.length > 0 && (
            <div className="px-5 pb-4 pt-1">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1 flex-wrap">
                  {(() => {
                    return (
                      <>
                        {etapas.map((etapa) => {
                          const isConcluida = etapa.status === 'CONCLUIDA';
                          const isEmAndamento = etapa.status === 'EM_ANDAMENTO';
                          return (
                            <Tooltip key={etapa.id}>
                              <TooltipTrigger asChild>
                                <button
                                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                                    isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'
                                  } ${
                                    isConcluida ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' :
                                    isEmAndamento ? 'bg-primary/15 text-primary font-bold ring-1 ring-primary/40' :
                                    'bg-muted/60 text-muted-foreground'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isAdmin) handleMoveToEtapa(r, etapa);
                                  }}
                                >
                                  {isConcluida && <CheckCircle2 className="h-3 w-3" />}
                                  <span className="truncate max-w-[80px]">{etapa.nome_etapa}</span>
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
                      </>
                    );
                  })()}
                </div>
              </TooltipProvider>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderCompactCard = (r: VendaRow) => {
    const tipoBadge = TIPO_PRODUTO_BADGE[r.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border';
    const tipoLabel = TIPO_PRODUTO_LABELS[r.tipo_produto || ''] || 'A classificar';
    const etapas = r.etapas || [];
    const statusCfg = STATUS_PEDIDO_CONFIG[r.status_atual] || {};
    const isPcpOp = r.origem_op === 'PCP';

    return (
      <div
        key={r.id}
        className={`rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
          isPcpOp ? 'bg-orange-50 dark:bg-orange-950/20 border-l-4 border-l-orange-500' :
          r.prioridade === 'URGENTE' ? 'border-l-4 border-l-destructive bg-card' :
          r.prioridade === 'ATENCAO' ? 'border-l-4 border-l-warning bg-card' :
          'border-l-4 border-l-[hsl(var(--success))] bg-card'
        }`}
        onClick={() => openDetail(r.id)}
      >
        <div className="px-4 py-2.5 space-y-1.5">
          {/* Linha 1 — Identificação */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-0 border-b border-border pb-1.5">
            <div className="px-2 py-0.5 border-r border-border">
              <span className="text-[11px] text-muted-foreground">Nº Venda</span>
              <p className="text-xs font-bold tabular-nums text-foreground">#{r.api_venda_id || r.numero_pedido}</p>
            </div>
            <div className="px-2 py-0.5 border-r border-border min-w-0">
              <span className="text-[11px] text-muted-foreground">Cliente</span>
              <p className="text-[14px] font-bold text-foreground truncate leading-tight">{r.cliente_nome}</p>
            </div>
            <div className="px-2 py-0.5 border-r border-border text-right">
              <span className="text-[11px] text-muted-foreground">Valor</span>
              <p className="text-xs font-bold tabular-nums text-foreground whitespace-nowrap">{fmt(r.valor_liquido)}</p>
            </div>
            <div className="px-2 py-0.5 border-r border-border text-center">
              <span className="text-[11px] text-muted-foreground">Tipo</span>
              <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                <Badge className={`text-[10px] font-semibold ${tipoBadge}`}>{tipoLabel}</Badge>
                {r.is_piloto && <Badge className="text-[10px] bg-purple-500/15 text-purple-600 border-purple-500/30">Piloto</Badge>}
                {isPcpOp && <Badge className="text-[10px] bg-orange-500/15 text-orange-600 border-orange-500/30 font-bold">OP PCP</Badge>}
                {r.origem_op === 'LOJA' && <Badge className="text-[10px] bg-purple-500/15 text-purple-600 border-purple-500/30 font-bold">OP Loja</Badge>}
              </div>
            </div>
            <div className="px-2 py-0.5 text-right">
              <span className="text-[11px] text-muted-foreground">Data Venda</span>
              <p className="text-xs font-semibold tabular-nums text-foreground whitespace-nowrap">{fmtDate(r.data_venda_api)}</p>
            </div>
          </div>

          {/* Corpo — Grid 30/70 */}
          <div className="grid grid-cols-[30%_70%] gap-0">
            {/* Lado esquerdo — Datas */}
            <div className="border-r border-border pr-2 text-[12px] tabular-nums space-y-1">
              {/* Linha 1: Entrega + Início Ideal lado a lado */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Entrega</span>
                  <p className="font-bold text-foreground">{fmtDate(r.dataEntregaEfetiva)}</p>
                </div>
                <div className="flex-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Início Ideal</span>
                  <p className={`font-bold px-1.5 py-0.5 rounded text-[11px] inline-block mt-0.5 ${
                    r.data_venda_api && r.dataEntregaEfetiva && r.data_venda_api === r.dataEntregaEfetiva
                      ? 'bg-destructive/15 text-destructive'
                      : 'bg-warning/20 text-foreground'
                  }`}>
                    {(() => {
                      if (r.data_venda_api && r.dataEntregaEfetiva && r.data_venda_api === r.dataEntregaEfetiva) {
                        return 'ENT IMEDIATA';
                      }
                      if (r.data_venda_api) {
                        const vendaDate = new Date(r.data_venda_api + 'T00:00:00');
                        const nextDay = new Date(vendaDate);
                        nextDay.setDate(nextDay.getDate() + 1);
                        while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
                          nextDay.setDate(nextDay.getDate() + 1);
                        }
                        return format(nextDay, 'dd/MM/yy');
                      }
                      return fmtDate(r.dataInicioIdeal);
                    })()}
                  </p>
                </div>
              </div>
              {/* Linha 2: Iniciado + Finalizado lado a lado */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Iniciado</span>
                  <p className="font-bold text-foreground text-[11px]">
                    {r.data_inicio_pcp ? new Date(r.data_inicio_pcp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
                <div className="flex-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Finalizado</span>
                  <p className="font-bold text-foreground text-[11px]">
                    {r.data_fim_pcp ? new Date(r.data_fim_pcp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
              </div>
              {/* Linha 3: Tempo de Produção + Ajustar Data */}
              <div className="flex items-end justify-between gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tempo Produção</span>
                  <p className={`font-bold text-[11px] ${r.atrasoDias < 0 ? 'text-destructive' : r.atrasoDias <= 2 ? 'text-warning' : 'text-[hsl(var(--success))]'}`}>
                    {(() => {
                      if (r.data_inicio_pcp && r.data_fim_pcp) {
                        const inicio = new Date(r.data_inicio_pcp);
                        const fim = new Date(r.data_fim_pcp);
                        const diffMs = fim.getTime() - inicio.getTime();
                        const hours = Math.floor(diffMs / (1000 * 60 * 60));
                        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
                        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                      }
                      if (r.data_inicio_pcp) {
                        const inicio = new Date(r.data_inicio_pcp);
                        const agora = new Date();
                        const diffMs = agora.getTime() - inicio.getTime();
                        const hours = Math.floor(diffMs / (1000 * 60 * 60));
                        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
                        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} ⏱`;
                      }
                      return '—';
                    })()}
                  </p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={`text-[10px] font-semibold px-2 py-1 rounded border transition-colors ${
                        r.data_entrega_ajustada_pcp ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                      }`}>
                        <CalendarIcon className="inline-block w-3 h-3 mr-1" />
                        {r.data_entrega_ajustada_pcp ? fmtDate(r.data_entrega_ajustada_pcp) : 'PCP'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <div className="p-2 border-b border-border flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Ajustar data de entrega</span>
                        {r.data_entrega_ajustada_pcp && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => saveEntregaAjustada(r.id, undefined)}>
                            Remover
                          </Button>
                        )}
                      </div>
                      <CalendarPicker
                        mode="single"
                        selected={r.data_entrega_ajustada_pcp ? new Date(r.data_entrega_ajustada_pcp + 'T00:00:00') : undefined}
                        onSelect={(date) => saveEntregaAjustada(r.id, date)}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Lado direito — Status, Etapa e Progresso */}
            <div className="pl-2 space-y-1.5">
              {/* Status + Etapa */}
              <div className="flex items-center gap-5 text-[13px]">
                <span className="text-muted-foreground">Status: <Badge className={`text-[11px] font-medium ml-1 ${(statusCfg as any).color || ''}`}>{(statusCfg as any).label || r.status_atual}</Badge></span>
                <span className="text-muted-foreground">Etapa: <span className="font-bold text-primary">{r.etapa_atual}</span></span>
              </div>

              {/* Progresso — apenas etapas do Kanban */}
              {etapas.length > 0 && (
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1">
                {etapas.filter(etapa => {
                  // Mostrar apenas etapas do Kanban de produção (excluir pós-produção)
                  const nome = etapa.nome_etapa?.toLowerCase() || '';
                  const excluidas = ['produção finalizada', 'producao finalizada'];
                  return !excluidas.some(ex => nome.includes(ex));
                }).map((etapa) => {
                  const isConcluida = etapa.status === 'CONCLUIDA';
                  const isEmAndamento = etapa.status === 'EM_ANDAMENTO';
                  return (
                    <Tooltip key={etapa.id}>
                      <TooltipTrigger asChild>
                        <button
                          className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all text-center ${
                            isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'
                          } ${
                            isConcluida ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' :
                            isEmAndamento ? 'bg-primary/15 text-primary font-bold ring-1 ring-primary/40' :
                            'bg-muted/60 text-muted-foreground'
                          }`}
                          onClick={(e) => { e.stopPropagation(); if (isAdmin) handleMoveToEtapa(r, etapa); }}
                        >{etapa.nome_etapa}</button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>{etapa.nome_etapa} — {isConcluida ? 'Concluída' : isEmAndamento ? 'Em Andamento' : 'Pendente'}</p>
                        {isAdmin && <p className="text-primary mt-0.5">Clique para mover</p>}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold text-center ${
                        isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : 'cursor-default'
                      } ${
                        r.ordem_status === 'CONCLUIDA' ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] font-bold' : 'bg-muted/60 text-muted-foreground'
                      }`}
                      onClick={(e) => { e.stopPropagation(); if (isAdmin) handleMoveToConcluido(r); }}
                    >Concluído</button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p>Concluído</p>
                    {isAdmin && <p className="text-primary mt-0.5">Clique para concluir</p>}
                  </TooltipContent>
                </Tooltip>
              </div>
              {/* Countdown to delivery date (15h cutoff) */}
              {(() => {
                const dataEntrega = r.data_entrega_ajustada_pcp || r.data_previsao_entrega;
                if (!dataEntrega) return null;
                const now = new Date();
                const deadline = new Date(dataEntrega + 'T15:00:00-03:00');
                const diffMs = deadline.getTime() - now.getTime();
                const isOverdue = diffMs < 0;
                const absDiffMs = Math.abs(diffMs);
                const totalHours = Math.floor(absDiffMs / (1000 * 60 * 60));
                const days = Math.floor(totalHours / 24);
                const hours = totalHours % 24;
                const label = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
                const colorClass = isOverdue
                  ? 'bg-destructive/15 text-destructive border-destructive/30'
                  : days <= 1
                    ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                    : days <= 3
                      ? 'bg-blue-500/15 text-blue-600 border-blue-500/30'
                      : 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
                return (
                  <div className="flex justify-center mt-1">
                    <div className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-full border text-xs font-bold ${colorClass}`}>
                      <Clock className="w-3.5 h-3.5" />
                      {isOverdue ? `Atrasado ${label}` : `Faltam ${label}`}
                    </div>
                  </div>
                );
              })()}
            </TooltipProvider>
          )}
            </div>
          </div>

          {/* PCP OP: Produto a produzir */}
          {isPcpOp && r.produtos_descricao && (
            <div className="px-4 pb-2">
              <div className="rounded-md border border-orange-300/50 bg-orange-100/30 dark:bg-orange-900/10 p-2 text-[11px]">
                <span className="text-muted-foreground font-medium">Produto a produzir: </span>
                <span className="font-bold text-foreground">{r.produtos_descricao}</span>
              </div>
            </div>
          )}

          {/* Gerar OP PCP button */}
          {canEdit && !isPcpOp && (
            <div className="px-4 pb-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 border-orange-400/50 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950/20"
                onClick={() => openGerarOpDialog(r.id)}
              >
                <Plus className="h-3 w-3" /> Gerar OP PCP
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };


  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Fila Mestre</h1>
          <Badge variant="outline" className="text-lg py-2 px-4 font-bold">{sorted.length} vendas</Badge>
          <Badge variant="outline" className="text-lg py-2 px-4 font-bold bg-blue-500/10 text-blue-600 border-blue-500/30">
            {sorted.filter(r => r.tipo_produto === 'SINTETICO').length} Sint
          </Badge>
          <Badge variant="outline" className="text-lg py-2 px-4 font-bold bg-amber-500/10 text-amber-600 border-amber-500/30">
            {sorted.filter(r => r.tipo_produto === 'TECIDO').length} Tec
          </Badge>
          <Badge variant="outline" className="text-lg py-2 px-4 font-bold bg-muted text-muted-foreground">
            {sorted.filter(r => r.tipo_produto !== 'SINTETICO' && r.tipo_produto !== 'TECIDO').length} Outro
          </Badge>
          <div className="h-6 w-px bg-border mx-1" />
          <Badge variant="outline" className="text-sm py-1.5 px-3 font-bold bg-purple-500/10 text-purple-600 border-purple-500/30">
            <Store className="h-3.5 w-3.5 mr-1" />
            {rows.filter(r => r.origem_op === 'LOJA').length} OP Loja
          </Badge>
          <Badge variant="outline" className="text-sm py-1.5 px-3 font-bold bg-orange-500/10 text-orange-600 border-orange-500/30">
            <Wrench className="h-3.5 w-3.5 mr-1" />
            {rows.filter(r => r.origem_op === 'PCP').length} OP PCP
          </Badge>
        </div>
        <div className="flex gap-2 items-center">
          {canEdit && (
            <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setConfigOpen(true)}>
              <Settings className="h-3 w-3 mr-1" /> PCP
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => navigate('/painel-dia')}>
            <Calendar className="h-3 w-3 mr-1" /> Painel
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1">
                <Download className="h-3 w-3" /> Exportar <ChevronDown className="h-2.5 w-2.5 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Filtrar por data de entrega:</span>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {exportDateFrom ? format(exportDateFrom, 'dd/MM/yy') : 'De'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker mode="single" selected={exportDateFrom} onSelect={setExportDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {exportDateTo ? format(exportDateTo, 'dd/MM/yy') : 'Até'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker mode="single" selected={exportDateTo} onSelect={setExportDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  {(exportDateFrom || exportDateTo) && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setExportDateFrom(undefined); setExportDateTo(undefined); }}>
                      Limpar
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 flex-1" onClick={exportAllToExcel}>
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 flex-1" onClick={exportAllToPdf}>
                    <FileText className="h-3.5 w-3.5 text-destructive" /> PDF
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* 5-Day Planning Grid */}
      {(() => {
        const todayStr = hojeBrasilia();
        const today = new Date(todayStr + 'T00:00:00');
        const next5: string[] = [];
        const cursor = new Date(today);
        // Include today if it's a business day
        if (isDiaUtil(cursor, calendarData)) next5.push(todayStr);
        while (next5.length < 5) {
          cursor.setDate(cursor.getDate() + 1);
          if (isDiaUtil(cursor, calendarData)) {
            const y = cursor.getFullYear();
            const m = String(cursor.getMonth() + 1).padStart(2, '0');
            const dd = String(cursor.getDate()).padStart(2, '0');
            next5.push(`${y}-${m}-${dd}`);
          }
        }
        const todayDate = new Date(todayStr + 'T00:00:00');
        const currentYear = todayDate.getFullYear();
        const monthNames = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
        const monthNamesFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const selectedMonthName = monthNames[selectedMonth];

        // Calculate week ranges for selected month
        const daysInSelectedMonth = new Date(currentYear, selectedMonth + 1, 0).getDate();
        const weeks: { num: number; start: number; end: number }[] = [];
        for (let w = 1; w <= 5; w++) {
          const start = (w - 1) * 7 + 1;
          const end = Math.min(w * 7, daysInSelectedMonth);
          if (start <= daysInSelectedMonth) weeks.push({ num: w, start, end });
        }

        const weekKey = `${currentYear}-${selectedMonth}-${selectedWeek}`;
        const wSint = weekSummary.sintetico;
        const wTec = weekSummary.tecido;
        const wTotal = wSint + wTec;
        const wConcl = weekSummary.concluido;
        const isWeekSelected = selectedWeekFilter === weekKey;

        return (
          <div className="grid grid-cols-6 gap-2">
            {next5.map((dayStr) => {
              const isToday = dayStr === todayStr;
              const isSelected = selectedPlanDay === dayStr;
              const dayDate = new Date(dayStr + 'T00:00:00');
              const dayLabel = `${String(dayDate.getDate()).padStart(2, '0')}/${String(dayDate.getMonth() + 1).padStart(2, '0')}`;

              const daySummaryData = dailySummary[dayStr] || { sintetico: 0, tecido: 0, concluido: 0 };
              const sinteticoPecas = daySummaryData.sintetico;
              const tecidoPecas = daySummaryData.tecido;
              const totalPecas = sinteticoPecas + tecidoPecas;
              const concluidoPecas = daySummaryData.concluido;

              return (
                <button
                  key={dayStr}
                  onClick={() => { setSelectedPlanDay(isSelected ? null : dayStr); setSelectedWeekFilter(null); }}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all hover:shadow-md",
                    isSelected ? "ring-2 ring-primary border-primary bg-primary/5" : "border-border/60 bg-card",
                    isToday && !isSelected && "border-primary/50 bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn("text-sm font-bold tabular-nums", isToday ? "text-primary" : "text-foreground")}>{dayLabel}</span>
                    {isToday && <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30 px-1.5 py-0">HOJE</Badge>}
                    <span className="text-sm font-bold tabular-nums text-foreground ml-auto">{totalPecas}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">🔵</span>
                      <span className="text-xs text-muted-foreground">Sint</span>
                      <span className="text-sm font-bold tabular-nums text-blue-600 ml-auto">{sinteticoPecas}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">🟠</span>
                      <span className="text-xs text-muted-foreground">Tec</span>
                      <span className="text-sm font-bold tabular-nums text-amber-600 ml-auto">{tecidoPecas}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">✔</span>
                      <span className="text-xs text-muted-foreground">Concl.</span>
                      <span className="text-sm font-bold tabular-nums text-emerald-600 ml-auto">{concluidoPecas}</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Card 6 - Consolidated Summary */}
            <div
              onClick={() => { setSelectedWeekFilter(isWeekSelected ? null : weekKey); setSelectedPlanDay(null); }}
              className={cn(
                "rounded-lg border p-3 text-left transition-all hover:shadow-md cursor-pointer",
                isWeekSelected ? "ring-2 ring-primary border-primary bg-primary/5" : "border-border bg-accent/10"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold text-foreground">{selectedMonthName}</span>
                <span className="text-sm font-bold tabular-nums text-foreground ml-auto">{wTotal}</span>
              </div>
              <div className="mb-1" onClick={e => e.stopPropagation()}>
                <Select value={String(selectedMonth)} onValueChange={(v) => { setSelectedMonth(Number(v)); setSelectedWeek(0); setSelectedWeekFilter(null); }}>
                  <SelectTrigger className="h-6 text-[11px] w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthNamesFull.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mb-1.5" onClick={e => e.stopPropagation()}>
                <Select value={String(selectedWeek)} onValueChange={(v) => { setSelectedWeek(Number(v)); setSelectedWeekFilter(null); }}>
                  <SelectTrigger className="h-6 text-[11px] w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Todas as semanas</SelectItem>
                    {weeks.map(w => (
                      <SelectItem key={w.num} value={String(w.num)}>Semana {w.num}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">🔵</span>
                  <span className="text-[11px] text-muted-foreground">Sint</span>
                  <span className="text-sm font-bold tabular-nums text-blue-600 ml-auto">{wSint}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">🟠</span>
                  <span className="text-[11px] text-muted-foreground">Tec</span>
                  <span className="text-sm font-bold tabular-nums text-amber-600 ml-auto">{wTec}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">✔</span>
                  <span className="text-[11px] text-muted-foreground">Concl.</span>
                  <span className="text-sm font-bold tabular-nums text-emerald-600 ml-auto">{wConcl}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {(selectedPlanDay || selectedWeekFilter) && (
        <div className="flex items-center gap-2">
          {selectedPlanDay && (
            <Badge className="bg-primary/10 text-primary border-primary/30">
              Filtrando: {(() => { const d = new Date(selectedPlanDay + 'T00:00:00'); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; })()}
            </Badge>
          )}
          {selectedWeekFilter && (
            <Badge className="bg-primary/10 text-primary border-primary/30">
              Filtrando: {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][selectedMonth]} {selectedWeek === 0 ? '(mês inteiro)' : `Semana ${selectedWeek}`}
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setSelectedPlanDay(null); setSelectedWeekFilter(null); }}>Limpar filtro</Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pedido, cliente..." value={search} onChange={e => setSearch(e.target.value)} />
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

        <div className="h-6 w-px bg-border mx-1" />

        <div className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <Select value={agrupamento} onValueChange={(v) => setAgrupamento(v as AgrupamentoType)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="data_entrega">Agrupar por Data de Entrega</SelectItem>
              <SelectItem value="tipo">Agrupar por Tipo</SelectItem>
              <SelectItem value="status">Agrupar por Status</SelectItem>
            </SelectContent>
          </Select>
        </div>

      </div>


      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sorted.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">Nenhum pedido encontrado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(group => {
            const isCollapsed = collapsedGroups.has(group.key);
            const hasUrgent = group.urgentes > 0;
            const compactDateLabel = agrupamento === 'data_entrega' && group.key !== 'SEM_DATA'
              ? (() => { try { return format(new Date(group.key + 'T00:00:00'), 'dd/MM'); } catch { return group.label; } })()
              : group.label;

            return (
              <div key={group.key} className="space-y-1">
                {/* Group header */}
                {/* Compact group header */}
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors text-left text-sm ${
                      hasUrgent ? 'bg-destructive/5 border-destructive/30 hover:bg-destructive/10' : 'bg-muted/50 border-border/60 hover:bg-muted/80'
                    }`}
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="font-bold">📅 {compactDateLabel}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="font-semibold text-foreground">{group.pedidos.length} pedidos</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">{group.totalPecas} pç</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="font-semibold text-foreground tabular-nums">{fmt(group.totalValor)}</span>
                    {group.urgentes > 0 && (
                      <>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-destructive font-bold">{group.urgentes} urg</span>
                      </>
                    )}
                    <span className="ml-auto flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Excel" onClick={(e) => { e.stopPropagation(); exportGroupToExcel(group); }}>
                        <FileSpreadsheet className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="PDF" onClick={(e) => { e.stopPropagation(); exportGroupToPdf(group); }}>
                        <FileText className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </span>
                  </button>

                {/* Group items */}
                {!isCollapsed && (
                  <div className="flex flex-col gap-1 pl-1">
                    {group.pedidos.map(renderCompactCard)}
                  </div>
                )}
              </div>
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

      <ConfigurarPcpDialog open={configOpen} onOpenChange={setConfigOpen} onSaved={fetchAll} />
    </div>
  );
}

/** Small helper component for the date grid cells */
function DateCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-sm tabular-nums mt-0.5 ${highlight ? 'font-bold text-foreground' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
