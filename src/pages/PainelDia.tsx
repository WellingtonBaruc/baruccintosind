import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Settings2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PcpCalendarData, subtrairDiasUteis, contarDiasUteis, isDiaUtil } from '@/lib/pcpCalendario';
import {
  calcularStatusPcp,
  calcularEtiqueta,
  calcularScorePrioridade,
  calcularDatasIdeais,
  gerarProjecaoCapacidade,
  type PedidoPainelDia,
  type TipoAnalytics,
  type CapacidadeDia,
} from '@/lib/pcpPainelDia';
import { TIPO_PRODUTO_LABELS } from '@/lib/pcp';
import PainelKpiCards from '@/components/painel-dia/PainelKpiCards';
import PainelTipoAnalytics from '@/components/painel-dia/PainelTipoAnalytics';
import PainelAgendaDia from '@/components/painel-dia/PainelAgendaDia';
import PainelCapacidadeCarga from '@/components/painel-dia/PainelCapacidadeCarga';
import PainelFilaPriorizada from '@/components/painel-dia/PainelFilaPriorizada';
import CapacidadeDialog from '@/components/painel-dia/CapacidadeDialog';

const STATUS_FINAIS = ['ENVIADO', 'ENTREGUE', 'FINALIZADO_SIMPLIFICA', 'CANCELADO', 'HISTORICO'];

export default function PainelDia() {
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<PedidoPainelDia[]>([]);
  const [tipoAnalytics, setTipoAnalytics] = useState<TipoAnalytics[]>([]);
  const [projecao, setProjecao] = useState<CapacidadeDia[]>([]);
  const [capacidadeHoje, setCapacidadeHoje] = useState({ sintetico: 0, tecido: 0, total: 0 });
  const [showCapDialog, setShowCapDialog] = useState(false);

  const hoje = new Date().toISOString().slice(0, 10);

  const fetchData = useCallback(async () => {
    // Load calendar data, lead times, and capacity in parallel
    const [calResult, ltResult, capPadraoResult, capDiariaResult] = await Promise.all([
      Promise.all([
        supabase.from('pcp_config_semana').select('*').limit(1).single(),
        supabase.from('pcp_feriados').select('data'),
        supabase.from('pcp_pausas').select('data_inicio, data_fim'),
      ]),
      supabase.from('pcp_lead_times').select('tipo, lead_time_dias').eq('ativo', true),
      supabase.from('pcp_capacidade_padrao').select('*').limit(1).single(),
      supabase.from('pcp_capacidade_diaria').select('*').gte('data', hoje).order('data'),
    ]);

    const [semanaRes, feriadosRes, pausasRes] = calResult;
    const cal: PcpCalendarData = {
      sabadoAtivo: semanaRes.data?.sabado_ativo ?? false,
      domingoAtivo: semanaRes.data?.domingo_ativo ?? false,
      feriados: (feriadosRes.data || []).map(f => f.data),
      pausas: (pausasRes.data || []).map(p => ({ inicio: p.data_inicio, fim: p.data_fim })),
    };

    const leadTimes: Record<string, number> = {};
    for (const lt of (ltResult.data || [])) {
      leadTimes[lt.tipo] = lt.lead_time_dias;
    }

    const capPadrao = {
      sintetico: capPadraoResult.data?.capacidade_sintetico ?? 30,
      tecido: capPadraoResult.data?.capacidade_tecido ?? 20,
      total: capPadraoResult.data?.capacidade_total ?? 50,
    };

    const capacidadesDiarias = new Map<string, { sintetico: number; tecido: number; total: number }>();
    for (const cd of (capDiariaResult.data || [])) {
      capacidadesDiarias.set(cd.data, {
        sintetico: cd.capacidade_sintetico,
        tecido: cd.capacidade_tecido,
        total: cd.capacidade_total,
      });
    }

    const capHoje = capacidadesDiarias.get(hoje) || capPadrao;
    setCapacidadeHoje(capHoje);

    // Load active orders with pedidos — filter final statuses server-side to avoid 1000-row limit
    const { data: ordensRaw } = await supabase
      .from('ordens_producao')
      .select(`
        id, status, tipo_produto, sequencia, data_programacao, programado_para_hoje, programado_inicio_data, programado_conclusao_data,
        pedidos!inner(
          id, numero_pedido, api_venda_id, cliente_nome, status_atual,
          data_venda_api, data_previsao_entrega, valor_liquido
        )
      `)
      .in('tipo_produto', ['SINTETICO', 'TECIDO'])
      .not('status', 'eq', 'CANCELADA')
      .not('pedidos.status_atual', 'in', `(${STATUS_FINAIS.join(',')})`)
      .not('status', 'eq', 'CONCLUIDA');

    if (!ordensRaw) {
      setLoading(false);
      return;
    }

    const ordens = ordensRaw;

    // Get current etapa for each ordem
    const ordemIds = ordens.map((o: any) => o.id);
    const { data: etapasData } = await supabase
      .from('op_etapas')
      .select('ordem_id, nome_etapa, status')
      .in('ordem_id', ordemIds)
      .in('status', ['EM_ANDAMENTO', 'PENDENTE'])
      .order('ordem_sequencia', { ascending: true });

    const etapaMap: Record<string, string> = {};
    for (const e of (etapasData || [])) {
      if (!etapaMap[e.ordem_id]) {
        etapaMap[e.ordem_id] = e.nome_etapa;
      }
    }

    // Get item quantities
    const pedidoIds = [...new Set(ordens.map((o: any) => o.pedidos.id))];
    const { data: itensData } = await supabase
      .from('pedido_itens')
      .select('pedido_id, quantidade, categoria_produto, descricao_produto')
      .in('pedido_id', pedidoIds);

    const qtdMap: Record<string, number> = {};
    for (const item of (itensData || [])) {
      const cat = (item.categoria_produto || '').toUpperCase();
      const desc = (item.descricao_produto || '').toUpperCase();
      if (cat === 'ADICIONAIS' || desc.includes('ADICIONAL')) continue;
      qtdMap[item.pedido_id] = (qtdMap[item.pedido_id] || 0) + item.quantidade;
    }

    // Build PedidoPainelDia list
    const hojeDate = new Date(hoje + 'T00:00:00');
    const cargasPorDia = new Map<string, { sintetico: number; tecido: number }>();

    const pedidosList: PedidoPainelDia[] = ordens.map((o: any) => {
      const p = o.pedidos;
      const tipo = o.tipo_produto || 'SINTETICO';
      const lt = leadTimes[tipo] || 5;
      const { dataInicioIdeal, dataConclusaoIdeal } = calcularDatasIdeais(p.data_previsao_entrega, lt, cal);

      const statusPcp = calcularStatusPcp({
        data_previsao_entrega: p.data_previsao_entrega,
        status_atual: p.status_atual,
        ordem_status: o.status,
        data_inicio_ideal: dataInicioIdeal,
        data_conclusao_ideal: dataConclusaoIdeal,
      }, hoje);

      const etiqueta = calcularEtiqueta(statusPcp, dataInicioIdeal, hoje);

      // Calculate days of delay
      let diasAtraso = 0;
      if (p.data_previsao_entrega) {
        const diffDias = contarDiasUteis(hojeDate, new Date(p.data_previsao_entrega + 'T00:00:00'), cal);
        if (diffDias < 0) diasAtraso = Math.abs(diffDias);
      }

      // Accumulate daily load based on ideal start date
      if (dataInicioIdeal && o.status !== 'CONCLUIDA') {
        const tipoKey = tipo as 'SINTETICO' | 'TECIDO';
        const existing = cargasPorDia.get(dataInicioIdeal) || { sintetico: 0, tecido: 0 };
        existing[tipoKey === 'SINTETICO' ? 'sintetico' : 'tecido'] += qtdMap[p.id] || 1;
        cargasPorDia.set(dataInicioIdeal, existing);
      }

      const pedidoPainel: PedidoPainelDia = {
        id: o.id,
        numero_pedido: p.numero_pedido,
        api_venda_id: p.api_venda_id,
        cliente_nome: p.cliente_nome,
        tipo_produto: tipo,
        status_atual: p.status_atual,
        etapa_atual: etapaMap[o.id] || null,
        data_venda: p.data_venda_api,
        data_previsao_entrega: p.data_previsao_entrega,
        data_inicio_ideal: dataInicioIdeal,
        data_conclusao_ideal: dataConclusaoIdeal,
        dias_atraso: diasAtraso,
        dias_risco: 0,
        quantidade_itens: qtdMap[p.id] || 0,
        valor_pedido: p.valor_liquido || 0,
        status_pcp: statusPcp,
        etiqueta,
        score_prioridade: 0,
        ordem_status: o.status,
      };

      return pedidoPainel;
    });

    // Deduplicate by pedido (numero_pedido) — keep entry with highest priority status
    const STATUS_PRIORITY: Record<string, number> = {
      ATRASADO: 6, EM_RISCO: 5, CONCLUIR_HOJE: 4, PROGRAMADO_HOJE: 3,
      EM_PRODUCAO_PRAZO: 2, NAO_INICIADO: 1, CONCLUIDO: 0,
    };
    const pedidoMap = new Map<string, PedidoPainelDia>();
    for (const p of pedidosList) {
      const key = p.numero_pedido;
      const existing = pedidoMap.get(key);
      if (!existing || (STATUS_PRIORITY[p.status_pcp] || 0) > (STATUS_PRIORITY[existing.status_pcp] || 0)) {
        pedidoMap.set(key, p);
      }
    }
    const pedidosDedup = Array.from(pedidoMap.values());

    // Identify bottleneck type
    const tipoAtrasos: Record<string, number[]> = {};
    for (const p of pedidosDedup) {
      if (p.dias_atraso > 0 && p.tipo_produto) {
        if (!tipoAtrasos[p.tipo_produto]) tipoAtrasos[p.tipo_produto] = [];
        tipoAtrasos[p.tipo_produto].push(p.dias_atraso);
      }
    }
    let gargaloTipo: string | null = null;
    let maxAvgAtraso = 0;
    for (const [tipo, atrasos] of Object.entries(tipoAtrasos)) {
      const avg = atrasos.reduce((s, v) => s + v, 0) / atrasos.length;
      if (avg > maxAvgAtraso) { maxAvgAtraso = avg; gargaloTipo = tipo; }
    }

    // Calculate priority scores
    for (const p of pedidosDedup) {
      p.score_prioridade = calcularScorePrioridade(p, gargaloTipo);
    }

    // Sort by score descending
    pedidosDedup.sort((a, b) => b.score_prioridade - a.score_prioridade);

    // Build type analytics
    const tipoStats: Record<string, TipoAnalytics> = {};
    for (const tipo of ['SINTETICO', 'TECIDO']) {
      const tipoPedidos = pedidosDedup.filter(p => p.tipo_produto === tipo);
      tipoStats[tipo] = {
        tipo,
        tipoLabel: TIPO_PRODUTO_LABELS[tipo] || tipo,
        pedidos: tipoPedidos.length,
        pecas: tipoPedidos.reduce((s, p) => s + p.quantidade_itens, 0),
        capacidade: tipo === 'SINTETICO' ? capHoje.sintetico : capHoje.tecido,
        carga: tipoPedidos.filter(p => p.status_pcp === 'PROGRAMADO_HOJE' || p.status_pcp === 'CONCLUIR_HOJE' || p.status_pcp === 'EM_PRODUCAO_PRAZO').reduce((s, p) => s + p.quantidade_itens, 0),
        saldo: 0,
        atrasoMedio: tipoPedidos.filter(p => p.dias_atraso > 0).length > 0
          ? tipoPedidos.filter(p => p.dias_atraso > 0).reduce((s, p) => s + p.dias_atraso, 0) / tipoPedidos.filter(p => p.dias_atraso > 0).length
          : 0,
        emRisco: tipoPedidos.filter(p => p.status_pcp === 'EM_RISCO').length,
        atrasados: tipoPedidos.filter(p => p.status_pcp === 'ATRASADO').length,
      };
      tipoStats[tipo].saldo = tipoStats[tipo].capacidade - tipoStats[tipo].carga;
    }

    // Generate capacity projection
    const proj = gerarProjecaoCapacidade(
      hojeDate, 8, cal, capPadrao, capacidadesDiarias, cargasPorDia,
    );

    setPedidos(pedidosDedup);
    setTipoAnalytics(Object.values(tipoStats));
    setProjecao(proj);
    setLoading(false);
  }, [hoje]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const iniciarHoje = pedidos.filter(p => p.status_pcp === 'PROGRAMADO_HOJE');
  const concluirHoje = pedidos.filter(p => p.status_pcp === 'CONCLUIR_HOJE');
  const atrasados = pedidos.filter(p => p.status_pcp === 'ATRASADO');
  const emRisco = pedidos.filter(p => p.status_pcp === 'EM_RISCO');
  const criticos = [...atrasados, ...emRisco].sort((a, b) => b.score_prioridade - a.score_prioridade);

  const cargaTotal = tipoAnalytics.reduce((s, t) => s + t.carga, 0);
  const saldoTotal = capacidadeHoje.total - cargaTotal;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel Inteligente PCP</h1>
          <p className="text-sm text-muted-foreground">Planejamento e controle da produção diária</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchData(); }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCapDialog(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Capacidade
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <PainelKpiCards
        iniciarHoje={iniciarHoje.length}
        concluirHoje={concluirHoje.length}
        atrasados={atrasados.length}
        emRisco={emRisco.length}
        capacidadeDia={capacidadeHoje.total}
        cargaDia={cargaTotal}
        saldoDia={saldoTotal}
      />

      {/* Type Analytics */}
      <PainelTipoAnalytics analytics={tipoAnalytics} />

      {/* Agenda do Dia */}
      <PainelAgendaDia
        iniciarHoje={iniciarHoje}
        concluirHoje={concluirHoje}
        criticos={criticos}
      />

      {/* Capacidade x Carga */}
      <PainelCapacidadeCarga projecao={projecao} />

      {/* Fila Priorizada */}
      <PainelFilaPriorizada pedidos={pedidos.filter(p => p.status_pcp !== 'CONCLUIDO')} />

      {/* Capacity Dialog */}
      <CapacidadeDialog open={showCapDialog} onClose={() => { setShowCapDialog(false); fetchData(); }} dataHoje={hoje} />
    </div>
  );
}
