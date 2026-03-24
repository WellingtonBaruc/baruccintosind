/**
 * Centralized visibility rules for pedidos across all screens.
 * Single source of truth — every UI filter should use these helpers.
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
  'ENVIADO', 'ENTREGUE',
  'CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO',
] as const;

/** Statuses that mean the pedido is in loja workflow */
export const STATUS_LOJA = [
  'AGUARDANDO_LOJA', 'LOJA_VERIFICANDO',
  'AGUARDANDO_OP_COMPLEMENTAR', 'AGUARDANDO_ALMOXARIFADO',
] as const;

/** Statuses that should NOT appear in loja screens (post-loja + production) */
export const STATUS_EXCLUIDOS_LOJA = [
  ...STATUS_POS_PRODUCAO,
  'AGUARDANDO_PRODUCAO', 'EM_PRODUCAO', 'PRODUCAO_CONCLUIDA',
  'LOJA_OK',
] as const;

/** 
 * Whether a pedido with given status_api should be visible in production screens.
 * Rule: only "Em Produção" from Simplifica should appear. "Pedido Enviado" goes to Loja.
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
  // For other statuses, check if it has active OPs
  return normalized === 'Em Produção';
}

/**
 * Map the Simplifica situação to the correct internal status_atual.
 * Used during import (planilha/sync) to avoid forcing EM_PRODUCAO for Pedido Enviado.
 */
export function mapSituacaoToStatusAtual(situacao: string): string {
  const normalized = situacao.trim();
  if (normalized === 'Em Produção') return 'EM_PRODUCAO';
  if (normalized === 'Pedido Enviado') return 'AGUARDANDO_LOJA';
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
