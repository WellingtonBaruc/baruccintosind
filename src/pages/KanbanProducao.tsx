import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { concluirEtapa, iniciarEtapa } from '@/lib/producao';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { calcularPrazoPcp, PcpCalendarData } from '@/lib/pcpCalendario';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, User, Search, CheckCircle2, ArrowRight, AlertTriangle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface KanbanCard {
  id: string;
  ordem_id: string;
  pedido_id: string;
  nome_etapa: string;
  etapa_status: string;
  ordem_sequencia: number;
  operador_id: string | null;
  operador_nome: string;
  api_venda_id: string;
  cliente_nome: string;
  tipo_produto: string;
  quantidade: number;
  status_prazo: string;
  data_previsao_entrega: string | null;
  ordem_status: string;
  has_sintetico_order: boolean;
  sintetico_ordem_id: string | null;
  transferred: boolean;
  tecido_transferred: boolean;
  pedido_status: string;
  perdas_pendentes: number;
  is_piloto: boolean;
  status_piloto: string | null;
  fivelas_recebidas: boolean;
  fivelas_separadas: boolean;
  sent_to_financeiro_at: number | null;
  ordem_sequencia_op: number;
  ordem_observacao: string | null;
}

// Unified columns
const UNIFIED_COLUMNS = ['Aguardando Início', 'Conferência', 'Fusionagem', 'Preparação', 'Montagem', 'Embalagem', 'Concluído'];

// Default sub-etapas per product type for Preparação
const PREPARACAO_SUBETAPAS: Record<string, string[]> = {
  SINTETICO: ['Costura', 'Ilhós', 'Máq. Fechar'],
  TECIDO: ['Colagem/Viração', 'Forração', 'Costura', 'Ilhós'],
  FIVELA_COBERTA: ['Preparação'],
};

function mapEtapaToColumn(etapaName: string, etapaStatus: string, ordemStatus: string, tipoProduto?: string): string {
  if (ordemStatus === 'AGUARDANDO') return 'Aguardando Início';
  if (ordemStatus === 'CONCLUIDA') return 'Concluído';

  // Fivela Coberta: map active stages
  if (tipoProduto === 'FIVELA_COBERTA') {
    if (etapaName === 'Em Andamento' || etapaName === 'Produção') return 'Preparação';
    if (etapaName === 'Concluído' || etapaName === 'Produção Finalizada') return 'Concluído';
    return 'Preparação';
  }

  // Tecido mappings
  if (tipoProduto === 'TECIDO') {
    if (etapaName === 'Conferência') return 'Conferência';
    if (etapaName === 'Fusionagem') return 'Fusionagem';
    if (etapaName === 'Colagem / Viração') return 'Preparação';
    if (etapaName === 'Finalização') return 'Montagem';
    if (etapaName === 'Produção Finalizada' || etapaName === 'Concluído') return 'Concluído';
    return etapaName;
  }

  // Sintético mappings (skip Conferência/Fusionagem)
  if (tipoProduto === 'SINTETICO') {
    if (etapaName === 'Corte') return 'Aguardando Início';
    if (etapaName === 'Preparação') return 'Preparação';
    if (etapaName === 'Montagem') return 'Montagem';
    if (etapaName === 'Embalagem') return 'Embalagem';
    if (etapaName === 'Produção Finalizada' || etapaName === 'Concluído') return 'Concluído';
    return etapaName;
  }

  // Fallback
  if (etapaName === 'Produção Finalizada' || etapaName === 'Concluído') return 'Concluído';
  return etapaName;
}

type FilterTipo = 'all' | 'SINTETICO' | 'TECIDO' | 'FIVELA_COBERTA';

export default function KanbanProducao() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState<FilterTipo>('all');
  const [filterMode, setFilterMode] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: string; card: KanbanCard | null }>({ open: false, type: '', card: null });
  const [transferDialog, setTransferDialog] = useState<{ open: boolean; card: KanbanCard | null }>({ open: false, card: null });

  // Loss registration
  const [lossDialog, setLossDialog] = useState<{ open: boolean; card: KanbanCard | null }>({ open: false, card: null });
  const [lossItems, setLossItems] = useState<any[]>([]);
  const [lossForm, setLossForm] = useState({ pedido_item_id: '', nm_item: '', quantidade_perdida: '', motivo: '', etapa: '' });
  const [lossEtapas, setLossEtapas] = useState<string[]>([]);

  // Preparação sub-etapas dialog
  const [prepDialog, setPrepDialog] = useState<{ open: boolean; card: KanbanCard | null }>({ open: false, card: null });
  const [subEtapas, setSubEtapas] = useState<{ id: string; nome: string; concluida: boolean }[]>([]);
  const [newSubEtapa, setNewSubEtapa] = useState('');
  const [loadingSubEtapas, setLoadingSubEtapas] = useState(false);

  // Recently sent to financeiro
  const [recentFinanceiro, setRecentFinanceiro] = useState<Map<string, number>>(new Map());

  const fetchCards = useCallback(async () => {
    const [etapasRes, semanaRes, feriadosRes, pausasRes, leadTimesRes] = await Promise.all([
      supabase
        .from('op_etapas')
        .select(`
          id, ordem_id, nome_etapa, ordem_sequencia, operador_id, status,
          usuarios(nome),
          ordens_producao!inner(
            id, pedido_id, tipo_produto, status, fivelas_recebidas, sequencia, observacao,
            pedidos!inner(api_venda_id, cliente_nome, status_prazo, data_previsao_entrega, status_api, status_atual, is_piloto, status_piloto, fivelas_separadas)
          )
        `)
        .in('status', ['EM_ANDAMENTO', 'CONCLUIDA', 'PENDENTE']),
      supabase.from('pcp_config_semana').select('*').limit(1).maybeSingle(),
      supabase.from('pcp_feriados').select('data'),
      supabase.from('pcp_pausas').select('data_inicio, data_fim'),
      supabase.from('pcp_lead_times').select('tipo, lead_time_dias').eq('ativo', true),
    ]);

    const etapas = etapasRes.data;
    const cal: PcpCalendarData = {
      sabadoAtivo: semanaRes.data?.sabado_ativo ?? false,
      domingoAtivo: semanaRes.data?.domingo_ativo ?? false,
      feriados: (feriadosRes.data || []).map((f: any) => f.data),
      pausas: (pausasRes.data || []).map((p: any) => ({ inicio: p.data_inicio, fim: p.data_fim })),
    };
    const leadTimeMap = new Map<string, number>();
    for (const lt of (leadTimesRes.data || [])) {
      leadTimeMap.set(lt.tipo, lt.lead_time_dias);
    }

    if (!etapas) { setLoading(false); return; }

    const HIDDEN_STATUSES = ['AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO', 'LIBERADO_LOGISTICA', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE', 'CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO'];
    const LOJA_HIDE_ALL = ['AGUARDANDO_LOJA', 'LOJA_VERIFICANDO'];
    const LOJA_SHOW_ONLY_OP = ['AGUARDANDO_OP_COMPLEMENTAR', 'AGUARDANDO_ALMOXARIFADO'];

    const visibleEtapas = (etapas as any[]).filter(e => {
      const pedidoStatus = e.ordens_producao.pedidos.status_atual;
      const ordemSequencia = e.ordens_producao.sequencia || 1;
      if (LOJA_HIDE_ALL.includes(pedidoStatus)) return false;
      if (LOJA_SHOW_ONLY_OP.includes(pedidoStatus)) return ordemSequencia > 1;
      if (pedidoStatus === 'AGUARDANDO_FINANCEIRO') {
        const cardKey = e.ordem_id;
        if (!recentFinanceiro.has(cardKey)) {
          setRecentFinanceiro(prev => new Map(prev).set(cardKey, Date.now()));
        }
        return recentFinanceiro.has(cardKey);
      }
      return !HIDDEN_STATUSES.includes(pedidoStatus);
    });

    const pedidoIds = [...new Set(visibleEtapas.map((e: any) => e.ordens_producao.pedido_id))];

    const [itensRes, allOrdensRes, perdasRes] = await Promise.all([
      supabase.from('pedido_itens').select('pedido_id, quantidade, categoria_produto, descricao_produto').in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']),
      supabase.from('ordens_producao').select('id, pedido_id, tipo_produto, status').in('pedido_id', pedidoIds.length > 0 ? pedidoIds : ['none']),
      supabase.from('ordem_perdas').select('ordem_id, status').eq('status', 'PENDENTE_CONFIRMACAO'),
    ]);

    const sinteticoMap = new Map<string, string>();
    const sinteticoExistsForPedido = new Set<string>();
    for (const o of (allOrdensRes.data || [])) {
      if (o.tipo_produto === 'SINTETICO') {
        sinteticoMap.set(o.pedido_id, o.id);
        sinteticoExistsForPedido.add(o.pedido_id);
      }
    }

    const qtdMap = new Map<string, number>();
    for (const item of (itensRes.data || [])) {
      const cat = (item.categoria_produto || '').toUpperCase();
      const desc = (item.descricao_produto || '').toUpperCase();
      if (cat === 'ADICIONAIS' || desc.includes('ADICIONAL')) continue;
      qtdMap.set(item.pedido_id, (qtdMap.get(item.pedido_id) || 0) + item.quantidade);
    }

    const perdasCount = new Map<string, number>();
    for (const p of (perdasRes.data || [])) {
      perdasCount.set(p.ordem_id, (perdasCount.get(p.ordem_id) || 0) + 1);
    }

    const ordemMap = new Map<string, any>();
    for (const e of visibleEtapas as any[]) {
      const key = e.ordem_id;
      const ordemStatus = e.ordens_producao?.status;
      const existing = ordemMap.get(key);
      if (!existing) { ordemMap.set(key, e); continue; }
      if (ordemStatus === 'AGUARDANDO') {
        if (e.ordem_sequencia < existing.ordem_sequencia) ordemMap.set(key, e);
      } else {
        if (e.status === 'EM_ANDAMENTO') ordemMap.set(key, e);
        else if (existing.status !== 'EM_ANDAMENTO' && e.ordem_sequencia > existing.ordem_sequencia) ordemMap.set(key, e);
      }
    }

    const kanbanCards: KanbanCard[] = Array.from(ordemMap.values()).map((e: any) => {
      const pedidoId = e.ordens_producao.pedido_id;
      const tipoProduto = e.ordens_producao.tipo_produto || 'OUTROS';
      const hasSintetico = tipoProduto === 'FIVELA_COBERTA' && sinteticoMap.has(pedidoId);
      const leadTime = leadTimeMap.get(tipoProduto) || 2;
      const pcpResult = calcularPrazoPcp(e.ordens_producao.pedidos.data_previsao_entrega, leadTime, cal);
      const dynamicPrazo = pcpResult.prioridade === 'URGENTE' ? 'ATRASADO' : pcpResult.prioridade === 'ATENCAO' ? 'ATENCAO' : 'NO_PRAZO';

      return {
        id: e.id,
        ordem_id: e.ordem_id,
        pedido_id: pedidoId,
        nome_etapa: e.nome_etapa,
        etapa_status: e.status,
        ordem_sequencia: e.ordem_sequencia,
        operador_id: e.operador_id,
        operador_nome: (e.usuarios as any)?.nome || '',
        api_venda_id: e.ordens_producao.pedidos.api_venda_id || '—',
        cliente_nome: e.ordens_producao.pedidos.cliente_nome,
        tipo_produto: tipoProduto,
        quantidade: qtdMap.get(pedidoId) || 0,
        status_prazo: dynamicPrazo,
        data_previsao_entrega: e.ordens_producao.pedidos.data_previsao_entrega,
        ordem_status: e.ordens_producao.status,
        has_sintetico_order: hasSintetico,
        sintetico_ordem_id: hasSintetico ? sinteticoMap.get(pedidoId)! : null,
        transferred: false,
        tecido_transferred: tipoProduto === 'TECIDO' && sinteticoExistsForPedido.has(pedidoId),
        pedido_status: e.ordens_producao.pedidos.status_atual,
        perdas_pendentes: perdasCount.get(e.ordem_id) || 0,
        is_piloto: e.ordens_producao.pedidos.is_piloto || false,
        status_piloto: e.ordens_producao.pedidos.status_piloto || null,
        fivelas_recebidas: e.ordens_producao.fivelas_recebidas || false,
        fivelas_separadas: e.ordens_producao.pedidos.fivelas_separadas || false,
        sent_to_financeiro_at: recentFinanceiro.get(e.ordem_id) || null,
        ordem_sequencia_op: e.ordens_producao.sequencia || 1,
        ordem_observacao: e.ordens_producao.observacao || null,
      };
    });

    setCards(kanbanCards);
    setLoading(false);
  }, [recentFinanceiro]);

  useEffect(() => {
    fetchCards();
    const channel = supabase
      .channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_producao' }, () => fetchCards())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'op_etapas' }, () => fetchCards())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRecentFinanceiro(prev => {
        const next = new Map(prev);
        let changed = false;
        for (const [k, t] of next) {
          if (now - t > 5 * 60 * 1000) { next.delete(k); changed = true; }
        }
        return changed ? next : prev;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const isSupervisor = profile && ['admin', 'gestor', 'supervisor_producao'].includes(profile.perfil);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !profile) return;
    const destCol = result.destination.droppableId;
    const card = cards.find(c => c.id === result.draggableId);
    if (!card) return;

    const currentCol = mapEtapaToColumn(card.nome_etapa, card.etapa_status, card.ordem_status, card.tipo_produto);
    if (currentCol === destCol) return;

    const srcIdx = UNIFIED_COLUMNS.indexOf(currentCol);
    const destIdx = UNIFIED_COLUMNS.indexOf(destCol);

    if (destIdx <= srcIdx) { toast.error('Não é possível voltar etapas.'); return; }
    if (destIdx !== srcIdx + 1) { toast.error('Só é possível avançar uma etapa por vez.'); return; }
    if (!isSupervisor) { toast.error('Apenas supervisores podem arrastar cards.'); return; }

    // Tecido going to Concluído — confirm cross-pipeline transfer
    if (destCol === 'Concluído' && card.tipo_produto === 'TECIDO') {
      setConfirmDialog({ open: true, type: 'TECIDO_CONCLUIDO', card });
      return;
    }

    await advanceCard(card);
  };

  const advanceCard = async (card: KanbanCard, obs?: string) => {
    try {
      if (card.ordem_status === 'AGUARDANDO') {
        const now = new Date().toISOString();
        await supabase.from('ordens_producao').update({
          status: 'EM_ANDAMENTO',
          data_inicio_pcp: now,
        }).eq('id', card.ordem_id);
        await iniciarEtapa(card.id, profile!.id, card.pedido_id);
        toast.success('Ordem iniciada com sucesso');
      } else {
        const { data: allEtapas } = await supabase
          .from('op_etapas')
          .select('id, ordem_sequencia')
          .eq('ordem_id', card.ordem_id)
          .order('ordem_sequencia');
        const isLastEtapa = allEtapas && allEtapas[allEtapas.length - 1]?.id === card.id;

        await concluirEtapa(card.id, card.ordem_id, card.pedido_id, profile!.id, obs || `Avançado via kanban por ${profile!.nome}`);

        if (isLastEtapa && card.tipo_produto === 'SINTETICO') {
          await supabase.from('ordens_producao').update({
            data_fim_pcp: new Date().toISOString(),
          }).eq('id', card.ordem_id);
        }

        toast.success('Etapa avançada com sucesso');
      }
      fetchCards();
    } catch {
      toast.error('Erro ao avançar etapa');
    }
  };

  const handleCrossPipelineConfirm = async () => {
    const { card } = confirmDialog;
    if (!card || !profile) return;
    setConfirmDialog({ open: false, type: '', card: null });
    try {
      await advanceCard(card, `Tecido concluído — encaminhado para Preparação do Sintético. Confirmado por ${profile.nome}`);
      await transferTecidoToSintetico(card.pedido_id, card.api_venda_id);
    } catch (err) {
      console.error('Erro na transferência Tecido→Sintético:', err);
      toast.error('Erro ao transferir para Sintético');
    }
  };

  const transferTecidoToSintetico = async (pedidoId: string, apiVendaId: string) => {
    if (!profile) return;
    const SINTETICO_PIPELINE_ID = '00000000-0000-0000-0000-000000000001';

    const { data: existingOrdens } = await supabase
      .from('ordens_producao')
      .select('id, status')
      .eq('pedido_id', pedidoId)
      .eq('tipo_produto', 'SINTETICO');

    if (existingOrdens && existingOrdens.length > 0) {
      const ordem = existingOrdens[0];
      if (ordem.status === 'AGUARDANDO') {
        await supabase.from('ordens_producao').update({
          status: 'EM_ANDAMENTO',
          data_inicio_pcp: new Date().toISOString(),
        }).eq('id', ordem.id);
        await supabase.from('op_etapas').update({
          status: 'CONCLUIDA',
          concluido_em: new Date().toISOString(),
          observacao: 'Etapa de Corte pulada — tecido já preparado.',
        }).eq('ordem_id', ordem.id).eq('nome_etapa', 'Corte');
        await supabase.from('op_etapas').update({
          status: 'EM_ANDAMENTO',
          iniciado_em: new Date().toISOString(),
        }).eq('ordem_id', ordem.id).eq('nome_etapa', 'Preparação');
      }
      toast.success(`Tecido transferido para Preparação Sintético (#${apiVendaId})`);
    } else {
      const { data: etapas } = await supabase
        .from('pipeline_etapas')
        .select('id, nome, ordem')
        .eq('pipeline_id', SINTETICO_PIPELINE_ID)
        .order('ordem');
      if (!etapas) return;

      const { data: maxSeq } = await supabase
        .from('ordens_producao')
        .select('sequencia')
        .eq('pedido_id', pedidoId)
        .order('sequencia', { ascending: false })
        .limit(1);
      const nextSeq = (maxSeq && maxSeq[0] ? maxSeq[0].sequencia : 0) + 1;

      const { data: novaOrdem, error: ordemErr } = await supabase
        .from('ordens_producao')
        .insert({
          pedido_id: pedidoId,
          pipeline_id: SINTETICO_PIPELINE_ID,
          sequencia: nextSeq,
          status: 'EM_ANDAMENTO',
          tipo_produto: 'SINTETICO',
          data_inicio_pcp: new Date().toISOString(),
          observacao: 'Criada automaticamente a partir do Tecido concluído.',
        })
        .select()
        .single();
      if (ordemErr || !novaOrdem) { toast.error('Erro ao criar ordem Sintético'); return; }

      const opEtapas = etapas.map(e => ({
        ordem_id: novaOrdem.id,
        pipeline_etapa_id: e.id,
        nome_etapa: e.nome,
        ordem_sequencia: e.ordem,
        status: e.nome === 'Corte' ? 'CONCLUIDA' as const
          : e.nome === 'Preparação' ? 'EM_ANDAMENTO' as const
          : 'PENDENTE' as const,
        ...(e.nome === 'Corte' ? { concluido_em: new Date().toISOString(), observacao: 'Etapa de Corte pulada — tecido já preparado.' } : {}),
        ...(e.nome === 'Preparação' ? { iniciado_em: new Date().toISOString() } : {}),
      }));
      await supabase.from('op_etapas').insert(opEtapas as any);
      toast.success(`Ordem Sintética criada na Preparação (#${apiVendaId})`);
    }

    await supabase.from('pedido_historico').insert({
      pedido_id: pedidoId,
      usuario_id: profile.id,
      tipo_acao: 'TRANSICAO',
      observacao: `Tecido concluído — ordem transferida para Preparação Sintético. Confirmado por ${profile.nome}`,
    });
    fetchCards();
  };

  const handleManualTecidoTransfer = async (card: KanbanCard) => {
    if (!profile) return;
    try {
      await transferTecidoToSintetico(card.pedido_id, card.api_venda_id);
    } catch {
      toast.error('Erro ao transferir para Sintético');
    }
  };

  const handleFivelaTransfer = async () => {
    const card = transferDialog.card;
    if (!card || !profile || !card.sintetico_ordem_id) return;
    try {
      await supabase.from('ordens_producao').update({ fivelas_recebidas: true }).eq('id', card.sintetico_ordem_id);
      await supabase.from('pedido_historico').insert({
        pedido_id: card.pedido_id, usuario_id: profile.id, tipo_acao: 'TRANSICAO',
        observacao: `Fivelas transferidas para Embalagem Sintético — confirmado pelo supervisor ${profile.nome}`,
      });
      toast.success(`Fivelas transferidas para Embalagem do Sintético (#${card.api_venda_id})`);
      setTransferDialog({ open: false, card: null });
      fetchCards();
    } catch { toast.error('Erro ao transferir fivelas'); }
  };

  const handleFivelaSoloComplete = async (card: KanbanCard) => {
    if (!profile) return;
    try {
      await supabase.from('pedidos').update({ status_atual: 'AGUARDANDO_COMERCIAL' }).eq('id', card.pedido_id);
      await supabase.from('pedido_historico').insert({
        pedido_id: card.pedido_id, usuario_id: profile.id, tipo_acao: 'TRANSICAO',
        status_anterior: 'EM_PRODUCAO', status_novo: 'AGUARDANDO_COMERCIAL',
        observacao: `Produção de fivelas concluída (sem sintético). Encaminhado para comercial por ${profile.nome}`,
      });
      toast.success('Pedido encaminhado para comercial');
      fetchCards();
    } catch { toast.error('Erro ao avançar pedido'); }
  };

  // --- Preparação Sub-etapas ---
  const openPrepDialog = async (card: KanbanCard) => {
    setPrepDialog({ open: true, card });
    setLoadingSubEtapas(true);
    setNewSubEtapa('');

    // Fetch existing sub-etapas for this op_etapa
    const { data: existing } = await supabase
      .from('op_etapa_subetapas')
      .select('id, nome, concluida')
      .eq('op_etapa_id', card.id)
      .order('criado_em');

    if (existing && existing.length > 0) {
      setSubEtapas(existing.map(s => ({ id: s.id, nome: s.nome, concluida: s.concluida ?? false })));
    } else {
      // Create default sub-etapas
      const defaults = PREPARACAO_SUBETAPAS[card.tipo_produto] || [];
      if (defaults.length > 0) {
        const inserts = defaults.map(nome => ({ op_etapa_id: card.id, nome, concluida: false }));
        const { data: created } = await supabase.from('op_etapa_subetapas').insert(inserts).select('id, nome, concluida');
        setSubEtapas((created || []).map(s => ({ id: s.id, nome: s.nome, concluida: s.concluida ?? false })));
      } else {
        setSubEtapas([]);
      }
    }
    setLoadingSubEtapas(false);
  };

  const toggleSubEtapa = async (subId: string, concluida: boolean) => {
    await supabase.from('op_etapa_subetapas').update({ concluida }).eq('id', subId);
    setSubEtapas(prev => prev.map(s => s.id === subId ? { ...s, concluida } : s));
  };

  const addCustomSubEtapa = async () => {
    const card = prepDialog.card;
    if (!card || !newSubEtapa.trim()) return;
    const { data } = await supabase.from('op_etapa_subetapas').insert({ op_etapa_id: card.id, nome: newSubEtapa.trim(), concluida: false }).select('id, nome, concluida').single();
    if (data) {
      setSubEtapas(prev => [...prev, { id: data.id, nome: data.nome, concluida: data.concluida ?? false }]);
      setNewSubEtapa('');
    }
  };

  const removeSubEtapa = async (subId: string) => {
    await supabase.from('op_etapa_subetapas').delete().eq('id', subId);
    setSubEtapas(prev => prev.filter(s => s.id !== subId));
  };

  // --- Loss Registration ---
  const openLossDialog = async (card: KanbanCard) => {
    setLossDialog({ open: true, card });
    setLossForm({ pedido_item_id: '', nm_item: '', quantidade_perdida: '', motivo: '', etapa: '' });
    const [itemsRes, etapasRes] = await Promise.all([
      supabase.from('pedido_itens').select('id, descricao_produto').eq('pedido_id', card.pedido_id),
      supabase.from('op_etapas').select('nome_etapa').eq('ordem_id', card.ordem_id).order('ordem_sequencia'),
    ]);
    setLossItems(itemsRes.data || []);
    setLossEtapas([...new Set((etapasRes.data || []).map(e => e.nome_etapa))]);
  };

  const submitLoss = async () => {
    const card = lossDialog.card;
    if (!card || !profile) return;
    if (!lossForm.pedido_item_id || !lossForm.quantidade_perdida || !lossForm.motivo || !lossForm.etapa) {
      toast.error('Preencha todos os campos'); return;
    }
    try {
      await supabase.from('ordem_perdas').insert({
        ordem_id: card.ordem_id,
        pedido_item_id: lossForm.pedido_item_id,
        nm_item: lossForm.nm_item,
        quantidade_perdida: parseInt(lossForm.quantidade_perdida),
        motivo: lossForm.motivo,
        etapa: lossForm.etapa,
        registrado_por: profile.id,
        status: 'PENDENTE_CONFIRMACAO',
      });
      toast.success('Perda registrada — aguardando confirmação do supervisor');
      setLossDialog({ open: false, card: null });
      fetchCards();
    } catch { toast.error('Erro ao registrar perda'); }
  };

  // Filter logic
  const getFilteredCards = () => {
    let filtered = cards;
    if (filterTipo !== 'all') {
      filtered = filtered.filter(c => c.tipo_produto === filterTipo);
    }
    if (profile?.perfil === 'operador_producao') {
      filtered = filtered.filter(c => c.operador_id === profile.id);
    }
    if (filterMode === 'ATRASADO') filtered = filtered.filter(c => c.status_prazo === 'ATRASADO');
    if (filterMode === 'SEM_OPERADOR') filtered = filtered.filter(c => !c.operador_id);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => c.api_venda_id.toLowerCase().includes(q) || c.cliente_nome.toLowerCase().includes(q));
    }
    return filtered;
  };

  const prazoOrder: Record<string, number> = { ATRASADO: 0, ATENCAO: 1, NO_PRAZO: 2 };

  const getCardsForColumn = (allCards: KanbanCard[], column: string) =>
    allCards
      .filter(c => mapEtapaToColumn(c.nome_etapa, c.etapa_status, c.ordem_status, c.tipo_produto) === column)
      .sort((a, b) => {
        const dA = a.data_previsao_entrega || '9999-12-31';
        const dB = b.data_previsao_entrega || '9999-12-31';
        if (dA !== dB) return dA.localeCompare(dB);
        const pA = prazoOrder[a.status_prazo] ?? 2;
        const pB = prazoOrder[b.status_prazo] ?? 2;
        return pA - pB;
      });

  const prazoClasses: Record<string, string> = {
    ATRASADO: 'border-l-destructive bg-destructive/10',
    ATENCAO: 'border-l-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10',
    NO_PRAZO: 'border-l-[hsl(var(--success))] bg-[hsl(var(--success))]/10',
  };

  const prazoBadge: Record<string, { label: string; cls: string }> = {
    ATRASADO: { label: 'Atrasado', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
    ATENCAO: { label: 'Atenção', cls: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30' },
    NO_PRAZO: { label: 'No prazo', cls: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' },
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const isConcluido = (card: KanbanCard) => card.ordem_status === 'CONCLUIDA';
  const isFivelaInConcluido = (card: KanbanCard, col: string) =>
    col === 'Concluído' && card.tipo_produto === 'FIVELA_COBERTA' && isConcluido(card);

  const getConcluidoBadge = (card: KanbanCard) => {
    if (card.pedido_status === 'AGUARDANDO_FINANCEIRO') {
      return { label: 'Enviado ao Financeiro', cls: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' };
    }
    if (card.pedido_status === 'AGUARDANDO_COMERCIAL' || card.pedido_status === 'PRODUCAO_CONCLUIDA' || card.pedido_status === 'EM_PRODUCAO') {
      return { label: 'Aguardando Comercial', cls: 'bg-orange-500/15 text-orange-600 border-orange-500/30' };
    }
    return { label: 'Concluído', cls: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' };
  };

  const filteredCards = getFilteredCards();

  const filterButtons: { key: FilterTipo; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'SINTETICO', label: 'Sintético' },
    { key: 'TECIDO', label: 'Tecido' },
    { key: 'FIVELA_COBERTA', label: 'Fivela Coberta' },
  ];

  const isInPreparacao = (card: KanbanCard) =>
    mapEtapaToColumn(card.nome_etapa, card.etapa_status, card.ordem_status, card.tipo_produto) === 'Preparação';

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Kanban de Produção</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar venda ou cliente..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-[220px]" />
          </div>
          <Select value={filterMode} onValueChange={setFilterMode}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ATRASADO">Atrasados</SelectItem>
              <SelectItem value="SEM_OPERADOR">Sem operador</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {filterButtons.map(fb => {
          const count = fb.key === 'all'
            ? cards.length
            : cards.filter(c => c.tipo_produto === fb.key).length;
          return (
            <Button
              key={fb.key}
              size="sm"
              variant={filterTipo === fb.key ? 'default' : 'outline'}
              onClick={() => setFilterTipo(fb.key)}
              className="gap-1.5"
            >
              {fb.label}
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${filterTipo === fb.key ? 'border-primary-foreground/30 text-primary-foreground' : ''}`}>{count}</Badge>
            </Button>
          );
        })}
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '65vh' }}>
          {UNIFIED_COLUMNS.map(col => {
            const colCards = getCardsForColumn(filteredCards, col);
            return (
              <Droppable droppableId={col} key={col}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-shrink-0 w-[250px] rounded-xl border border-border/60 bg-muted/30 p-2 transition-colors ${snapshot.isDraggingOver ? 'bg-accent/40' : ''}`}
                  >
                    <div className="flex items-center justify-between px-2 py-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">{col}</h3>
                      <Badge variant="outline" className="text-[10px] ml-1">{colCards.length}</Badge>
                    </div>
                    <div className="space-y-2 min-h-[80px]">
                      {colCards.map((card, index) => {
                        const inConcluido = col === 'Concluído';
                        const fivelaWithSintetico = isFivelaInConcluido(card, col) && card.has_sintetico_order;
                        const fivelaSolo = isFivelaInConcluido(card, col) && !card.has_sintetico_order;
                        const isTecidoConcluido = inConcluido && card.tipo_produto === 'TECIDO' && isConcluido(card);
                        const tecidoAlreadyTransferred = isTecidoConcluido && card.tecido_transferred;
                        const tecidoNeedsTransfer = isTecidoConcluido && !card.tecido_transferred;
                        const cardInPrep = isInPreparacao(card);

                        return (
                          <Draggable key={card.id} draggableId={card.id} index={index} isDragDisabled={!isSupervisor || inConcluido}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={`rounded-lg border bg-card p-3 shadow-sm border-l-4 ${prazoClasses[card.status_prazo] || 'border-l-border'} ${snap.isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''}`}
                              >
                                <p className="font-bold text-base leading-tight">
                                  {card.api_venda_id}
                                  {card.ordem_sequencia_op > 1 && (
                                    <span className="text-xs font-medium text-primary ml-1.5">• OP {card.ordem_sequencia_op}</span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{card.cliente_nome}</p>
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <Badge className={`text-[10px] font-normal ${TIPO_PRODUTO_BADGE[card.tipo_produto] || 'bg-muted text-muted-foreground border-border'}`}>
                                    {TIPO_PRODUTO_LABELS[card.tipo_produto] || card.tipo_produto}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">{card.quantidade} un</span>
                                  <Badge variant="outline" className={`text-[10px] ${prazoBadge[card.status_prazo]?.cls || ''}`}>
                                    {prazoBadge[card.status_prazo]?.label || '—'}
                                  </Badge>
                                </div>

                                {card.is_piloto && (
                                  <Badge className={`mt-1.5 text-[10px] ${card.status_piloto === 'REPROVADO' ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-purple-500/15 text-purple-600 border-purple-500/30'}`}>
                                    {card.status_piloto === 'REPROVADO' ? 'PILOTO REPROVADO' : 'PILOTO'}
                                  </Badge>
                                )}

                                {card.tipo_produto === 'SINTETICO' && card.fivelas_recebidas && (
                                  <Badge className="mt-1.5 text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                                    Fivela pronta ✓
                                  </Badge>
                                )}

                                {card.tipo_produto === 'SINTETICO' && card.fivelas_separadas && (
                                  <Badge className="mt-1.5 text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                                    Fivelas separadas ✓
                                  </Badge>
                                )}

                                {card.perdas_pendentes > 0 && (
                                  <Badge className="mt-1.5 text-[10px] bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30">
                                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                                    {card.perdas_pendentes} perda{card.perdas_pendentes > 1 ? 's' : ''} pendente{card.perdas_pendentes > 1 ? 's' : ''}
                                  </Badge>
                                )}

                                {/* Concluído lifecycle badges */}
                                {inConcluido && !fivelaWithSintetico && (() => {
                                  const badge = getConcluidoBadge(card);
                                  return <Badge className={`mt-2 text-[10px] ${badge.cls}`}>{badge.label}</Badge>;
                                })()}

                                {inConcluido && fivelaWithSintetico && (
                                  <Badge className="mt-2 text-[10px] bg-orange-500/15 text-orange-600 border-orange-500/30">
                                    Aguardando transferência
                                  </Badge>
                                )}

                                {card.data_previsao_entrega && (
                                  <p className="text-[10px] text-muted-foreground mt-1.5">
                                    Entrega: {new Date(card.data_previsao_entrega + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                  </p>
                                )}
                                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  {card.operador_nome
                                    ? <span>{card.operador_nome}</span>
                                    : <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">Sem operador</Badge>
                                  }
                                </div>

                                {/* Preparação checklist button */}
                                {cardInPrep && (
                                  <Button size="sm" variant="outline" className="w-full mt-2 h-7 text-[10px]" onClick={() => openPrepDialog(card)}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Sub-etapas da Preparação
                                  </Button>
                                )}

                                {/* Fivela transfer button */}
                                {fivelaWithSintetico && isSupervisor && (
                                  <Button size="sm" className="w-full mt-2 h-8 text-xs bg-orange-600 hover:bg-orange-700" onClick={() => setTransferDialog({ open: true, card })}>
                                    <ArrowRight className="h-3 w-3 mr-1" /> Transferir para Embalagem Sintético
                                  </Button>
                                )}

                                {fivelaSolo && isSupervisor && (
                                  <Button size="sm" variant="outline" className="w-full mt-2 h-8 text-xs" onClick={() => handleFivelaSoloComplete(card)}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Encaminhar para Comercial
                                  </Button>
                                )}

                                {tecidoAlreadyTransferred && (
                                  <Badge className="mt-2 text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                                    Transferido para Sintético ✓
                                  </Badge>
                                )}
                                {tecidoNeedsTransfer && isSupervisor && (
                                  <Button size="sm" className="w-full mt-2 h-8 text-xs" onClick={() => handleManualTecidoTransfer(card)}>
                                    <ArrowRight className="h-3 w-3 mr-1" /> Transferir para Preparação Sintético
                                  </Button>
                                )}

                                {!inConcluido && col !== 'Aguardando Início' && (
                                  <Button size="sm" variant="ghost" className="w-full mt-1 h-7 text-[10px] text-muted-foreground" onClick={() => openLossDialog(card)}>
                                    + Registrar Perda
                                  </Button>
                                )}

                                {isSupervisor && col !== 'Aguardando Início' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className={`w-full mt-1 h-7 text-[10px] ${card.is_piloto ? 'text-purple-600' : 'text-muted-foreground'}`}
                                    onClick={async () => {
                                      const newVal = !card.is_piloto;
                                      await supabase.from('pedidos').update({ is_piloto: newVal, status_piloto: newVal ? 'ENVIADO' : null }).eq('id', card.pedido_id);
                                      toast.success(newVal ? 'Marcado como piloto' : 'Piloto removido');
                                      fetchCards();
                                    }}
                                  >
                                    {card.is_piloto ? '✦ Piloto ativo' : '+ Marcar Piloto'}
                                  </Button>
                                )}

                                {profile?.perfil === 'operador_producao' && card.operador_id === profile.id && !inConcluido && col !== 'Aguardando Início' && (
                                  <Button size="sm" className="w-full mt-2 h-8 text-xs" onClick={() => advanceCard(card, `Concluído pelo operador ${profile.nome}`)}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmar conclusão
                                  </Button>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Tecido cross-pipeline dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={o => !o && setConfirmDialog({ open: false, type: '', card: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tecido concluído — confirmar entrada no Sintético</DialogTitle></DialogHeader>
          <DialogDescription>Confirmar que o tecido do pedido #{confirmDialog.card?.api_venda_id} está pronto e deve entrar na Preparação do Kanban Sintético?</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, type: '', card: null })}>Cancelar</Button>
            <Button onClick={handleCrossPipelineConfirm}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fivela transfer dialog */}
      <Dialog open={transferDialog.open} onOpenChange={o => !o && setTransferDialog({ open: false, card: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar entrega das fivelas para Embalagem</DialogTitle></DialogHeader>
          <DialogDescription>Confirmar entrega das fivelas para o setor de Embalagem do pedido #{transferDialog.card?.api_venda_id}?</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialog({ open: false, card: null })}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={handleFivelaTransfer}>
              <ArrowRight className="h-4 w-4 mr-1" /> Confirmar Transferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preparação sub-etapas dialog */}
      <Dialog open={prepDialog.open} onOpenChange={o => !o && setPrepDialog({ open: false, card: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Sub-etapas da Preparação — #{prepDialog.card?.api_venda_id}
            </DialogTitle>
            <DialogDescription>
              {prepDialog.card?.tipo_produto === 'TECIDO' ? 'Tecido' : prepDialog.card?.tipo_produto === 'SINTETICO' ? 'Sintético' : prepDialog.card?.tipo_produto}
              {' • '}{prepDialog.card?.cliente_nome}
            </DialogDescription>
          </DialogHeader>
          {loadingSubEtapas ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-3">
              {subEtapas.map(sub => (
                <div key={sub.id} className="flex items-center gap-3 group">
                  <Checkbox
                    checked={sub.concluida}
                    onCheckedChange={(checked) => toggleSubEtapa(sub.id, !!checked)}
                  />
                  <span className={`flex-1 text-sm ${sub.concluida ? 'line-through text-muted-foreground' : ''}`}>{sub.nome}</span>
                  {isSupervisor && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={() => removeSubEtapa(sub.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}

              {/* Add custom sub-etapa */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Input
                  placeholder="Adicionar outra sub-etapa..."
                  value={newSubEtapa}
                  onChange={e => setNewSubEtapa(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomSubEtapa()}
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="outline" className="h-8 px-2" onClick={addCustomSubEtapa} disabled={!newSubEtapa.trim()}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="text-xs text-muted-foreground pt-1">
                {subEtapas.filter(s => s.concluida).length}/{subEtapas.length} concluídas
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrepDialog({ open: false, card: null })}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loss registration dialog */}
      <Dialog open={lossDialog.open} onOpenChange={o => !o && setLossDialog({ open: false, card: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Perda — Venda #{lossDialog.card?.api_venda_id}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Item</Label>
              <Select value={lossForm.pedido_item_id} onValueChange={v => {
                const item = lossItems.find(i => i.id === v);
                setLossForm({ ...lossForm, pedido_item_id: v, nm_item: item?.descricao_produto || '' });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione o item" /></SelectTrigger>
                <SelectContent>
                  {lossItems.map(i => <SelectItem key={i.id} value={i.id}>{i.descricao_produto}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade perdida</Label>
              <Input type="number" min="1" value={lossForm.quantidade_perdida} onChange={e => setLossForm({ ...lossForm, quantidade_perdida: e.target.value })} />
            </div>
            <div>
              <Label>Motivo da perda</Label>
              <Textarea placeholder="Ex: defeito no corte, mancha no material..." value={lossForm.motivo} onChange={e => setLossForm({ ...lossForm, motivo: e.target.value })} />
            </div>
            <div>
              <Label>Etapa onde ocorreu</Label>
              <Select value={lossForm.etapa} onValueChange={v => setLossForm({ ...lossForm, etapa: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                <SelectContent>
                  {lossEtapas.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLossDialog({ open: false, card: null })}>Cancelar</Button>
            <Button onClick={submitLoss}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
