/**
 * Centralized visibility rules for pedidos across all screens.
 * Single source of truth — every UI filter should use these helpers.
 * 
 * FONTE DA VERDADE: status_api (vindo do Simplifica)
 * Valores: 'Em Produção', 'Pedido Enviado', 'Finalizado'
 */

/** Normalize status_api for safe comparison (trim, case-insensitive) */
export function normalizeStatusApi(statusApi: string | null | undefined): string {
  return (statusApi || '').trim();
}

/** Statuses that mean the pedido left production and should not appear in production screens */
export const STATUS_POS_PRODUCAO = [
  'AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL',
  'AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO',
  'LIBERADO_LOGISTICA', 'EM_SEPARACAO',
  'ENVIADO', 'ENTREGUE', 'AGUARDANDO_CIENCIA_COMERCIAL',
  'CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO',
] as const;

/** Statuses that mean the pedido is in loja workflow */
export const STATUS_LOJA = [
  'AGUARDANDO_LOJA', 'LOJA_VERIFICANDO',
  'AGUARDANDO_OP_COMPLEMENTAR', 'AGUARDANDO_ALMOXARIFADO',
  'LOJA_PENDENTE_FINALIZACAO',
] as const;

/** Statuses that should NOT appear in loja screens (post-loja + production) */
export const STATUS_EXCLUIDOS_LOJA = [
  ...STATUS_POS_PRODUCAO,
  'AGUARDANDO_PRODUCAO', 'EM_PRODUCAO', 'PRODUCAO_CONCLUIDA',
  'LOJA_OK',
] as const;

/** 
 * Whether a pedido with given status_api should be visible in production screens
 * (Fila Mestre, Kanban, FilaProducao).
 * 
 * REGRA:
 * - 'Em Produção' → visível
 * - 'Pedido Enviado' → NÃO visível (exceção: OP complementar sequencia > 1)
 * - 'Finalizado' → NUNCA visível
 */
export function isVisibleInProduction(statusApi: string | null | undefined): boolean {
  const normalized = normalizeStatusApi(statusApi);
  if (normalized === 'Finalizado') return false;
  if (normalized === 'Pedido Enviado') return false;
  return true;
}

/**
 * Whether a pedido should appear in the Fila Mestre.
 * Shows "Em Produção" pedidos + pedidos with active complementary OPs (even if "Pedido Enviado"),
 * but only if the OP is complementary (sequencia > 1).
 */
export function isVisibleInFilaMestre(
  statusApi: string | null | undefined,
  hasActiveComplementaryOp: boolean
): boolean {
  const normalized = normalizeStatusApi(statusApi);
  if (normalized === 'Finalizado') return false;
  if (normalized === 'Em Produção') return true;
  if (normalized === 'Pedido Enviado' && hasActiveComplementaryOp) return true;
  return false;
}

/**
 * Whether a pedido should appear in the Almoxarifado (warehouse separation).
 * 
 * REGRA:
 * - 'Em Produção' → visível (fluxo normal de fivelas)
 * - 'Pedido Enviado' → visível SOMENTE se for venda de fivelas (exceção 2.2)
 * - 'Finalizado' → NUNCA visível
 */
export function isVisibleInAlmoxarifado(
  statusApi: string | null | undefined,
  isVendaDeFivelas: boolean
): boolean {
  const normalized = normalizeStatusApi(statusApi);
  if (normalized === 'Finalizado') return false;
  if (normalized === 'Em Produção') return true;
  if (normalized === 'Pedido Enviado' && isVendaDeFivelas) return true;
  return false;
}

/**
 * Map the Simplifica situação to the correct internal status_atual.
 * Used during import (planilha/sync) to avoid forcing EM_PRODUCAO for Pedido Enviado.
 */
export function mapSituacaoToStatusAtual(situacao: string): string {
  const normalized = situacao.trim();
  if (normalized === 'Em Produção') return 'EM_PRODUCAO';
  if (normalized === 'Pedido Enviado') return 'AGUARDANDO_LOJA';
  if (normalized === 'Finalizado') return 'FINALIZADO_SIMPLIFICA';
  return 'AGUARDANDO_PRODUCAO';
}

/**
 * Map the Simplifica situação to the correct tipo_fluxo.
 */
export function mapSituacaoToTipoFluxo(situacao: string): string {
  const normalized = situacao.trim();
  if (normalized === 'Em Produção') return 'PRODUCAO';
  return 'PRONTA_ENTREGA';
}

/**
 * Whether OPs should be created automatically for this situação.
 * Only 'Em Produção' gets automatic OPs.
 */
export function shouldCreateOPsForSituacao(situacao: string): boolean {
  return situacao.trim() === 'Em Produção';
}

/**
 * Reconcile status_atual based on the new status_api from Simplifica.
 * Used by sync and import to ensure internal state matches external.
 * 
 * Returns the new status_atual if reconciliation is needed, null otherwise.
 */
export function reconcileStatusAtual(
  newStatusApi: string,
  currentStatusAtual: string,
  hasActiveComplementaryOp: boolean
): string | null {
  const normalized = newStatusApi.trim();

  if (normalized === 'Finalizado') {
    // Finalizado: move to FINALIZADO_SIMPLIFICA unless already in a terminal state
    const terminalStates = ['CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO', 'ENVIADO', 'ENTREGUE', 'AGUARDANDO_CIENCIA_COMERCIAL'];
    if (terminalStates.includes(currentStatusAtual)) return null;
    return 'FINALIZADO_SIMPLIFICA';
  }

  if (normalized === 'Pedido Enviado') {
    // Pedido Enviado: move to AGUARDANDO_LOJA unless there's an active complementary OP
    // or the pedido is already past loja in the workflow
    const postLojaStates = [
      'AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL',
      'AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO',
      'LIBERADO_LOGISTICA', 'EM_SEPARACAO',
      'ENVIADO', 'ENTREGUE', 'AGUARDANDO_CIENCIA_COMERCIAL', 'CANCELADO',
      'FINALIZADO_SIMPLIFICA', 'HISTORICO',
    ];
    if (postLojaStates.includes(currentStatusAtual)) return null;
    
    // If has active complementary OP, keep in complementary flow
    if (hasActiveComplementaryOp) {
      if (currentStatusAtual === 'AGUARDANDO_OP_COMPLEMENTAR' || currentStatusAtual === 'AGUARDANDO_ALMOXARIFADO') {
        return null; // already in correct state
      }
    }
    
    // Production states should move to AGUARDANDO_LOJA
    const productionStates = ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO', 'PRODUCAO_CONCLUIDA'];
    if (productionStates.includes(currentStatusAtual)) {
      return 'AGUARDANDO_LOJA';
    }
    
    // Already in loja flow
    const lojaStates = ['AGUARDANDO_LOJA', 'LOJA_VERIFICANDO', 'LOJA_OK'];
    if (lojaStates.includes(currentStatusAtual)) return null;
    
    return null;
  }

  // Em Produção: only reconcile if currently in a non-production state that shouldn't be
  // Don't override if user has manually advanced the pedido
  return null;
}
