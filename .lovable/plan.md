

# Fix OP Complementar: Status, Kanban visibility, and Faltantes display

## Summary
Three fixes for the complementary production order (OP) flow generated from the Store menu.

## Changes

### 1. OP Complementar must start in "Aguardando Início"
**Files:** `src/pages/VerificacaoLoja.tsx`

In `handleCaminhoB` (line 162) and `handleCaminhoD` (line 246), the OP is created with `status: 'EM_ANDAMENTO'` and the first etapa with `status: 'EM_ANDAMENTO'`. Change both to:
- Order status: `'AGUARDANDO'`
- All etapas: `status: 'PENDENTE'`, no `iniciado_em`

This matches the rule already applied to sync-simplifica.

### 2. OP Complementar appears as a card in the Kanban
**Files:** `src/pages/KanbanProducao.tsx`, `src/pages/VerificacaoLoja.tsx`

Currently, OP_COMPLEMENTAR cards have `tipo_produto: 'OP_COMPLEMENTAR'` which doesn't match any Kanban tab (SINTETICO, TECIDO, FIVELA_COBERTA). The fix:

- In `VerificacaoLoja.tsx`, when creating the OP complementar, set `tipo_produto` to the appropriate pipeline type (default to `'SINTETICO'` since the default pipeline is Cinto Sintético). The OP will then appear in the correct Kanban tab.
- The card will show in Kanban with the order's `observacao` field containing the faltante items info, and the `api_venda_id` from the parent pedido.

### 3. Show faltante items in DetalheOrdem (Fila Mestre detail)
**File:** `src/pages/DetalheOrdem.tsx`

In the "Itens do Pedido" section (line 601), add visual indicators for items marked as faltante:
- Show a red badge "Faltante" next to items where `disponivel === false`
- Display `quantidade_faltante` when set (e.g., "3 de 10 faltantes")
- Add `disponivel` and `quantidade_faltante` to the query (already fetched since we select `*` from `pedido_itens`)

### Technical details

**VerificacaoLoja.tsx — handleCaminhoB (lines 158-181):**
- Change `status: 'EM_ANDAMENTO'` → `status: 'AGUARDANDO'`
- Change `tipo_produto: 'OP_COMPLEMENTAR'` → `tipo_produto: 'SINTETICO'` (or based on pipeline)
- All etapas: `status: 'PENDENTE'`, remove `iniciado_em` conditional

**VerificacaoLoja.tsx — handleCaminhoD (lines 242-264):**
- Same changes as handleCaminhoB for the OP creation

**DetalheOrdem.tsx — Itens section (lines 607-619):**
- Add faltante badge and quantity display for items with `disponivel === false`

**Database correction:**
- Update existing `ordens_producao` with `tipo_produto = 'OP_COMPLEMENTAR'` to `tipo_produto = 'SINTETICO'` and `status = 'AGUARDANDO'` where no progress has been made

