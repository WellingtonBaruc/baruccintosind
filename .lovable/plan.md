

# Add missing quantity field when marking item as "Faltante"

## Problem
When a store user marks an item as "Faltante" during verification, there is no way to specify how many units are missing. Currently it just marks the entire item as unavailable.

## Changes

### 1. Add `quantidade_faltante` column to `pedido_itens`
Run a migration to add a new nullable integer column `quantidade_faltante` to the `pedido_itens` table (defaults to NULL).

### 2. Update `VerificacaoLoja.tsx`
- Add `quantidade_faltante` to the `PedidoItem` interface
- When an item is marked as "Faltante" (`disponivel === false`), show a number input field below it labeled "Qtd faltante" with min=1 and max=item.quantidade, defaulting to item.quantidade
- Auto-save `quantidade_faltante` to the database when the user changes the value
- Use `quantidade_faltante` (instead of `quantidade`) when generating OP complementar descriptions and almoxarifado requests (paths B, C, D)

### Technical details
- The quantity input appears inline right after the "Faltante" button is clicked
- Default value when marking faltante: full item quantity
- The field is an `<Input type="number">` with appropriate min/max constraints

