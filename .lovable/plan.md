

## Problem

The "Enviar para o Comercial" button appears on cards in the "Concluído" column, but clicking it fails with "Ainda existem ordens em andamento para este pedido." This happens because a card can land in the "Concluído" column when its current etapa is "Produção Finalizada" — even though the `ordens_producao.status` is still `EM_ANDAMENTO`, not `CONCLUIDA`.

The validation at line 744 checks `allOrdens?.every(o => o.status === 'CONCLUIDA')`, which fails for these cases.

## Solution

Update `handleEnviarParaComercial` to treat orders whose last etapa is "Produção Finalizada" (or equivalent) as effectively concluded, rather than strictly requiring `status === 'CONCLUIDA'`.

### Changes in `src/pages/KanbanProducao.tsx`

1. **Relax the all-concluded check**: Instead of only checking `ordens_producao.status === 'CONCLUIDA'`, also fetch each order's etapas and consider an order "done" if its current active etapa maps to the "Concluído" column (i.e., etapa name is "Produção Finalizada" or ordem status is "CONCLUIDA").

2. **Auto-mark ordem as CONCLUIDA**: When the card's etapa is "Produção Finalizada" but ordem status hasn't been updated yet, automatically update the ordem status to `CONCLUIDA` and mark remaining etapas as `CONCLUIDA` before transitioning to comercial. This keeps data consistent.

### Implementation detail

In `handleEnviarParaComercial`:
- Fetch all ordens for the pedido along with their etapas
- For each ordem not yet `CONCLUIDA`, check if its current etapa maps to "Concluído" column
- If so, auto-conclude that ordem (update status + etapas)
- If any ordem is genuinely still in progress (not in final etapa), show the error
- Otherwise proceed with the comercial transition

