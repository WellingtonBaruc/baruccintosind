

## Diagnóstico: Cards Duplicados no Kanban Produção

### Causa Raiz

O sistema exibe **um card por Ordem de Produção (OP)**, não por venda. Quando uma venda tem múltiplas OPs (ex: TECIDO seq1 + SINTÉTICO seq2), ambas aparecem no Kanban como cards separados com o mesmo número de venda.

**Vendas afetadas atualmente:**
- 3085410, 3090872, 3093749, 3094415 → TECIDO (Concluído) + SINTÉTICO (Em Andamento)
- 3095255, 3095425, 3097292 → Duas OPs SINTÉTICO
- 3099077 → TECIDO + OUTROS

### Solução Proposta

**1. Ocultar ordens CONCLUÍDA quando existe OP ativa no mesmo pedido**

Se um pedido tem uma OP seq1 CONCLUÍDA e uma OP seq2 ainda ativa, esconder a OP concluída do Kanban. O card da OP ativa já mostra o badge "OP 2", então o contexto se mantém.

**2. Melhorar a diferenciação visual das OPs complementares**

Para OPs que legitimamente aparecem juntas (ambas ativas), tornar o badge "OP" mais proeminente:
- Badge maior e colorido (azul) com o texto "OP Complementar"
- Mostrar o tipo de produto da OP principal como referência

### Arquivo alterado
- `src/pages/KanbanProducao.tsx` — Ajuste na lógica de filtragem (`visibleEtapas` / `ordemMap`) para ocultar ordens concluídas quando há OP ativa, e melhoria visual nos badges de OP.

### Detalhes Técnicos

Na função `fetchCards`, após construir o `kanbanCards`, adicionar filtro:
- Agrupar cards por `pedido_id`
- Se um pedido tem cards em "Concluído" E cards em colunas ativas, remover os de "Concluído"
- Manter badge "OP X" mais visível nos cards restantes

