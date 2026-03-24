// PCP Painel Inteligente — logic for daily planning dashboard

import { PcpCalendarData, subtrairDiasUteis, contarDiasUteis, adicionarDiasUteis, isDiaUtil } from './pcpCalendario';

export type StatusPcpInteligente =
  | 'NAO_INICIADO'
  | 'PROGRAMADO_HOJE'
  | 'EM_PRODUCAO_PRAZO'
  | 'CONCLUIR_HOJE'
  | 'EM_RISCO'
  | 'ATRASADO'
  | 'CONCLUIDO';

export type EtiquetaPrioridade = 'CRITICO' | 'HOJE' | 'PROXIMO' | 'REPROGRAMAVEL';

export interface PedidoPainelDia {
  id: string;
  numero_pedido: string;
  api_venda_id: string | null;
  cliente_nome: string;
  tipo_produto: string | null;
  status_atual: string;
  etapa_atual: string | null;
  data_venda: string | null;
  data_previsao_entrega: string | null;
  data_inicio_ideal: string | null;
  data_conclusao_ideal: string | null;
  dias_atraso: number;
  dias_risco: number;
  quantidade_itens: number;
  valor_pedido: number;
  status_pcp: StatusPcpInteligente;
  etiqueta: EtiquetaPrioridade;
  score_prioridade: number;
  ordem_status: string;
  programado_inicio_data: string | null;
  programado_conclusao_data: string | null;
  pedido_id: string;
}

export interface CapacidadeDia {
  data: string;
  capacidade_sintetico: number;
  capacidade_tecido: number;
  capacidade_total: number;
  carga_sintetico: number;
  carga_tecido: number;
  carga_total: number;
  saldo_sintetico: number;
  saldo_tecido: number;
  saldo_total: number;
}

export interface TipoAnalytics {
  tipo: string;
  tipoLabel: string;
  pedidos: number;
  pecas: number;
  capacidade: number;
  carga: number;
  saldo: number;
  atrasoMedio: number;
  emRisco: number;
  atrasados: number;
}

const STATUS_FINAIS = ['ENVIADO', 'ENTREGUE', 'FINALIZADO_SIMPLIFICA', 'CANCELADO', 'HISTORICO', 'AGUARDANDO_CIENCIA_COMERCIAL'];

export function calcularStatusPcp(
  pedido: {
    data_previsao_entrega: string | null;
    status_atual: string;
    ordem_status: string;
    data_inicio_ideal: string | null;
    data_conclusao_ideal: string | null;
  },
  hoje: string,
): StatusPcpInteligente {
  if (STATUS_FINAIS.includes(pedido.status_atual) || pedido.ordem_status === 'CONCLUIDA') {
    return 'CONCLUIDO';
  }

  const emProducao = pedido.status_atual === 'EM_PRODUCAO' || pedido.ordem_status === 'EM_ANDAMENTO';
  const inicioIdeal = pedido.data_inicio_ideal;
  const conclusaoIdeal = pedido.data_conclusao_ideal;

  // Atrasado: past delivery date (regardless of production status)
  if (pedido.data_previsao_entrega && pedido.data_previsao_entrega < hoje) return 'ATRASADO';

  // Concluir hoje: delivery is today
  if (pedido.data_previsao_entrega === hoje && emProducao) return 'CONCLUIR_HOJE';
  if (conclusaoIdeal === hoje && emProducao) return 'CONCLUIR_HOJE';

  // Programado hoje: should start today
  if (inicioIdeal === hoje && !emProducao) return 'PROGRAMADO_HOJE';

  // Em risco: should have started but hasn't
  if (inicioIdeal && inicioIdeal < hoje && !emProducao) return 'EM_RISCO';

  // Em risco: delivery within 2 days
  if (pedido.data_previsao_entrega) {
    const diffMs = new Date(pedido.data_previsao_entrega + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime();
    const diffDias = Math.ceil(diffMs / 86400000);
    if (diffDias <= 2 && diffDias >= 1 && !emProducao) return 'EM_RISCO';
  }

  // Em produção no prazo
  if (emProducao) return 'EM_PRODUCAO_PRAZO';

  return 'NAO_INICIADO';
}

export function calcularEtiqueta(status: StatusPcpInteligente, inicioIdeal: string | null, hoje: string): EtiquetaPrioridade {
  if (status === 'ATRASADO' || status === 'EM_RISCO') return 'CRITICO';
  if (status === 'PROGRAMADO_HOJE' || status === 'CONCLUIR_HOJE') return 'HOJE';

  if (inicioIdeal) {
    const diffMs = new Date(inicioIdeal + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime();
    const diffDias = Math.ceil(diffMs / 86400000);
    if (diffDias <= 3 && diffDias > 0) return 'PROXIMO';
  }

  return 'REPROGRAMAVEL';
}

export function calcularScorePrioridade(pedido: {
  dias_atraso: number;
  dias_risco: number;
  status_pcp: StatusPcpInteligente;
  valor_pedido: number;
  data_previsao_entrega: string | null;
  tipo_produto: string | null;
}, gargaloTipo: string | null): number {
  let score = 0;

  // Atraso weight (most important)
  if (pedido.dias_atraso > 0) score += pedido.dias_atraso * 100;

  // Status weight
  const statusScores: Record<StatusPcpInteligente, number> = {
    ATRASADO: 500,
    EM_RISCO: 300,
    CONCLUIR_HOJE: 250,
    PROGRAMADO_HOJE: 200,
    EM_PRODUCAO_PRAZO: 50,
    NAO_INICIADO: 100,
    CONCLUIDO: 0,
  };
  score += statusScores[pedido.status_pcp] || 0;

  // Delivery date proximity
  if (pedido.data_previsao_entrega) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const entrega = new Date(pedido.data_previsao_entrega + 'T00:00:00');
    const diffDias = Math.ceil((entrega.getTime() - hoje.getTime()) / 86400000);
    if (diffDias <= 0) score += 200;
    else if (diffDias <= 3) score += 100;
    else if (diffDias <= 7) score += 50;
  }

  // Bottleneck type bonus
  if (gargaloTipo && pedido.tipo_produto === gargaloTipo) score += 80;

  // Value tiebreaker (normalize to 0-50 range)
  score += Math.min(pedido.valor_pedido / 200, 50);

  return Math.round(score);
}

export function calcularDatasIdeais(
  dataPrevisaoEntrega: string | null,
  leadTimeDias: number,
  cal: PcpCalendarData,
): { dataInicioIdeal: string | null; dataConclusaoIdeal: string | null } {
  if (!dataPrevisaoEntrega) return { dataInicioIdeal: null, dataConclusaoIdeal: null };

  const entrega = new Date(dataPrevisaoEntrega + 'T00:00:00');
  const dataConclusaoIdeal = dataPrevisaoEntrega; // must be done by delivery
  const dataInicioIdeal = subtrairDiasUteis(entrega, leadTimeDias, cal);

  return {
    dataInicioIdeal: dataInicioIdeal.toISOString().slice(0, 10),
    dataConclusaoIdeal,
  };
}

export function gerarProjecaoCapacidade(
  hoje: Date,
  dias: number,
  cal: PcpCalendarData,
  capacidadePadrao: { sintetico: number; tecido: number; total: number },
  capacidadesDiarias: Map<string, { sintetico: number; tecido: number; total: number }>,
  cargasPorDia: Map<string, { sintetico: number; tecido: number }>,
): CapacidadeDia[] {
  const result: CapacidadeDia[] = [];
  const current = new Date(hoje);
  let counted = 0;

  while (counted < dias) {
    if (isDiaUtil(current, cal)) {
      const ds = current.toISOString().slice(0, 10);
      const cap = capacidadesDiarias.get(ds) || capacidadePadrao;
      const carga = cargasPorDia.get(ds) || { sintetico: 0, tecido: 0 };

      result.push({
        data: ds,
        capacidade_sintetico: cap.sintetico,
        capacidade_tecido: cap.tecido,
        capacidade_total: cap.total,
        carga_sintetico: carga.sintetico,
        carga_tecido: carga.tecido,
        carga_total: carga.sintetico + carga.tecido,
        saldo_sintetico: cap.sintetico - carga.sintetico,
        saldo_tecido: cap.tecido - carga.tecido,
        saldo_total: cap.total - (carga.sintetico + carga.tecido),
      });
      counted++;
    }
    current.setDate(current.getDate() + 1);
  }

  return result;
}

export const STATUS_PCP_CONFIG: Record<StatusPcpInteligente, { label: string; color: string; icon: string }> = {
  ATRASADO: { label: 'Atrasado', color: 'bg-destructive/15 text-destructive border-destructive/30', icon: '🔴' },
  EM_RISCO: { label: 'Em Risco', color: 'bg-warning/15 text-amber-700 border-warning/30', icon: '🟡' },
  CONCLUIR_HOJE: { label: 'Concluir Hoje', color: 'bg-orange-500/15 text-orange-700 border-orange-300', icon: '🟠' },
  PROGRAMADO_HOJE: { label: 'Iniciar Hoje', color: 'bg-blue-500/15 text-blue-700 border-blue-300', icon: '🔵' },
  EM_PRODUCAO_PRAZO: { label: 'Em Produção', color: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30', icon: '🟢' },
  NAO_INICIADO: { label: 'Não Iniciado', color: 'bg-muted text-muted-foreground border-border', icon: '⚪' },
  CONCLUIDO: { label: 'Concluído', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20', icon: '✅' },
};

export const ETIQUETA_CONFIG: Record<EtiquetaPrioridade, { label: string; color: string }> = {
  CRITICO: { label: 'Crítico', color: 'bg-destructive text-destructive-foreground' },
  HOJE: { label: 'Hoje', color: 'bg-primary text-primary-foreground' },
  PROXIMO: { label: 'Próximo', color: 'bg-warning text-warning-foreground' },
  REPROGRAMAVEL: { label: 'Reprogramável', color: 'bg-muted text-muted-foreground' },
};
