

# Investigacao: Vendas "Em Producao" faltando no sistema

## Diagnostico

### O que o banco de dados tem

O banco tem **20 pedidos** com `status_atual = EM_PRODUCAO` e `status_api = 'Em Produção'`, mais 1 pedido (3085410/PED-00143) que ja avancou para `AGUARDANDO_FINANCEIRO`.

**Todos os 20 pedidos EM_PRODUCAO tem OPs e etapas criadas corretamente.**

### Venda faltando: 3080376

A venda **3080376** (data 09/03/2026) **nao existe no banco de dados**. Ela nunca foi importada porque:

- A sincronizacao automatica (`sync-simplifica`) usa janela de **2 dias** para sincronizacoes subsequentes
- Na primeira sincronizacao, usa **15 dias**
- A venda 3080376 e de 09/03, que ja estava fora da janela quando o sistema comecou a sincronizar

### Por que o Kanban mostra menos que 20

O Kanban tem um **filtro por tipo de produto** (`filterTipo`). Se voce selecionou "Sintetico" ou "Tecido", ele esconde os outros tipos. Alem disso, a logica de deduplicacao esconde OPs concluidas quando o mesmo pedido tem outra OP ativa.

## Plano de Correcao

### 1. Importar a venda 3080376 (e outras antigas)

Adicionar um parametro opcional `dias_override` na funcao `sync-simplifica` para permitir uma sincronizacao com janela maior (ex: 30 dias). Isso permite importar vendas antigas sem alterar o comportamento normal.

**Arquivo:** `supabase/functions/sync-simplifica/index.ts`
- Aceitar `{ dias_override: 30 }` no body da requisicao
- Usar esse valor no lugar do `diasImportacao` padrao de 2 dias

### 2. Adicionar botao "Sincronizar Historico" na tela de Integracao

**Arquivo:** `src/pages/Integracao.tsx`
- Adicionar botao que chama `sync-simplifica` com `dias_override: 30`
- Permite ao usuario importar vendas antigas manualmente

### 3. Verificar filtro do Kanban

Nenhuma mudanca de codigo necessaria. Verifique se o filtro de tipo no topo do Kanban esta em "Todos" e nao em um tipo especifico.

## Resumo

| Problema | Causa | Solucao |
|----------|-------|---------|
| Venda 3080376 nao aparece | Fora da janela de sync (2 dias) | Sync com janela expandida |
| Kanban mostra 15 e nao 20 | Filtro de tipo ativo ou dedup de OPs | Verificar filtro "Todos" |

