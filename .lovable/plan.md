

## Diagnóstico

A página Almoxarifado atualmente só exibe vendas que possuem itens com descrição/categoria contendo "FIVELA", "PASSANTE" ou "AVIAMENTO" (filtro `isFivelaItem` na linha 66). Vendas sem esses termos nos itens são ignoradas, mesmo que estejam "Em Produção" ou tenham solicitações da loja.

Além disso, a página não consulta a tabela `solicitacoes_almoxarifado` — ou seja, solicitações feitas pela loja nunca aparecem.

## Plano de Correção — `src/pages/Almoxarifado.tsx`

### 1. Mostrar todas as vendas "Em Produção" com fivelas + solicitações da loja

Alterar `fetchVendas` para buscar dados de duas fontes:

- **Fonte A — Fivelas automáticas**: Pedidos com `status_api = 'Em Produção'` que tenham itens do tipo fivela (lógica atual do `isFivelaItem`).
- **Fonte B — Solicitações da loja**: Consultar `solicitacoes_almoxarifado` com status `PENDENTE`, trazer os pedidos associados e exibir como cards com a descrição e quantidade solicitada.

### 2. Unificar a exibição

Mesclar as duas fontes num único array de cards, evitando duplicatas por `pedido_id`. Quando um pedido aparece nas duas fontes, combinar os itens (fivelas + solicitações).

### 3. Adicionar indicador de origem

Cada card terá um badge indicando se é "Fivelas" (automático) ou "Solicitação Loja" para o almoxarifado saber a origem.

### Detalhes técnicos

- Nova query: `supabase.from('solicitacoes_almoxarifado').select('*').eq('status', 'PENDENTE')`
- Buscar pedidos relacionados às solicitações para obter `api_venda_id`, `cliente_nome`, etc.
- Filtrar pedidos da Fonte A por `status_api = 'Em Produção'` (adicionar `.eq('status_api', 'Em Produção')`)
- Interface `FivelaVenda` ganha campo `origem: 'fivela' | 'solicitacao' | 'ambos'` e os itens de solicitação usam a mesma estrutura

