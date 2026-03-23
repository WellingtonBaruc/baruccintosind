

# Fix: Sync must create orders in "Aguardando Início" state

## Problem

The `sync-simplifica` edge function creates new production orders with `status: 'EM_ANDAMENTO'` and the first `op_etapa` with `status: 'EM_ANDAMENTO'`. This causes orders to skip the "Aguardando Início" state in both Kanban and Fila Mestre.

## Rule

All orders imported from Simplifica with `status_api = 'Em Produção'` must start in **Aguardando Início** (`AGUARDANDO`) with all etapas in `PENDENTE`. Only when a user manually moves the card in the Kanban should it transition to `EM_ANDAMENTO`.

## Changes

### 1. Fix `sync-simplifica/index.ts` — `inserirNovoPedido` function

**Line 526**: Change `status: 'EM_ANDAMENTO'` to `status: 'AGUARDANDO'`

**Line 538**: Change first etapa from `'EM_ANDAMENTO'` to `'PENDENTE'` — all etapas start as PENDENTE.

**Line 539**: Remove `iniciado_em` assignment for the first etapa.

### 2. Fix existing data in database

Run a migration/query to correct existing orders that were incorrectly created with `EM_ANDAMENTO`:
- Update all `ordens_producao` with `status = 'EM_ANDAMENTO'` where no etapa has been actually worked on (no `concluido_em` set) → set to `AGUARDANDO`
- Update all `op_etapas` with `status = 'EM_ANDAMENTO'` where `concluido_em IS NULL AND operador_id IS NULL` → set to `PENDENTE`, clear `iniciado_em`

This will make all Kanban boards show orders in "Aguardando Início" and the Fila Mestre "Etapa" column will correctly display "Aguardando Início".

