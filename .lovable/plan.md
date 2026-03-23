

# Fix: Kanban card duplication and wrong etapa being concluded

## Problem

When order 3095425 was dragged from "Aguardando Início" to "Corte", two critical bugs triggered:

1. **Wrong etapa concluded**: For AGUARDANDO orders (all etapas PENDENTE), the card selection logic picks the etapa with the highest `ordem_sequencia` — "Produção Finalizada" (step 5). When the user drags, `concluirEtapa` is called on that step, which concludes it and marks the entire order as CONCLUIDA (since it's the last step). The order jumps from "Aguardando" straight to "Concluído".

2. **Duplication**: This pedido has 2 orders (original + OP complementar), both SINTETICO. Both appear as separate cards. After the bug above, both are stuck in "Concluído" with all intermediate etapas still PENDENTE.

## Root Cause

The `handleDragEnd` → `advanceCard` → `concluirEtapa` flow doesn't handle the AGUARDANDO → first-etapa transition. It always calls `concluirEtapa(card.id)`, but for AGUARDANDO orders, the correct action is to **start** the first etapa, not conclude any etapa.

## Changes

### 1. Fix `KanbanProducao.tsx` — etapa selection for AGUARDANDO orders

**Lines 158-165**: When the order status is AGUARDANDO, select the **first** etapa (lowest `ordem_sequencia`) instead of the highest. This ensures the card references the correct starting etapa.

### 2. Fix `KanbanProducao.tsx` — handle AGUARDANDO → first column transition

**`handleDragEnd` / `advanceCard` (lines 207-240)**: When a card's `ordem_status` is `'AGUARDANDO'` and the destination is the first production column (e.g., "Corte"):
- Set the order status to `EM_ANDAMENTO`
- Call `iniciarEtapa` on the first etapa (not `concluirEtapa`)
- Refresh the board

### 3. Fix corrupted data for order 3095425

Run SQL to reset both orders back to AGUARDANDO with all etapas PENDENTE:
- Reset `ordens_producao.status` to `AGUARDANDO`
- Reset all `op_etapas` to `PENDENTE`, clear `concluido_em` and `iniciado_em`

### Technical details

**KanbanProducao.tsx — ordemMap logic (line 158-165):**
```text
For AGUARDANDO orders:
  → pick etapa with LOWEST ordem_sequencia (first step)
For EM_ANDAMENTO orders:
  → keep existing logic (pick EM_ANDAMENTO etapa, or highest)
```

**KanbanProducao.tsx — advanceCard (line 232-240):**
```text
if card.ordem_status === 'AGUARDANDO':
  1. UPDATE ordens_producao SET status = 'EM_ANDAMENTO'
  2. Call iniciarEtapa(card.id, userId, pedidoId)  // starts first etapa
  3. fetchCards()
else:
  existing concluirEtapa logic
```

**SQL data fix:**
```sql
UPDATE ordens_producao SET status = 'AGUARDANDO'
WHERE id IN ('208f39d8-...', 'cb9b5cae-...');

UPDATE op_etapas SET status = 'PENDENTE', concluido_em = NULL, iniciado_em = NULL
WHERE ordem_id IN ('208f39d8-...', 'cb9b5cae-...');
```

