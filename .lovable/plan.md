

## Fix: Hide duplicate "OUTROS" OPs when main OP exists

### Problem
Sales 3103921 and 3103964 each have two production orders:
- 3103921: OP seq1 = TECIDO + OP seq2 = OUTROS
- 3103964: OP seq1 = SINTETICO + OP seq2 = OUTROS

The current deduplication only merges cards with the **same** `pedido_id + tipo_produto`. Since OUTROS is a different type, both cards appear as separate entries, looking like duplicates.

### Solution
In `src/pages/KanbanProducao.tsx`, after the existing deduplication logic, add a rule: if a pedido has an "OUTROS" OP **and** also has a main OP (SINTETICO, TECIDO, or FIVELA_COBERTA), hide the "OUTROS" card. The "OUTROS" OP is typically a secondary/accessory item that should not appear as a separate card.

### Technical Change
**File: `src/pages/KanbanProducao.tsx`** (~lines 388-400)

In the `filteredCards` filter function, add a condition:
- For cards with `tipo_produto === 'OUTROS'`, check if the same `pedido_id` has another OP with a non-OUTROS type. If so, exclude the OUTROS card.

This is a ~5-line addition inside the existing filter block.

