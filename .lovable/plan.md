

## Diagnóstico: Venda 3103964 mostrando "Produção Finalizada" incorretamente

### Causa Raiz

A venda 3103964 possui **duas Ordens de Produção**:
1. OP SINTETICO (status: EM_ANDAMENTO) -- a principal, ainda ativa no Kanban
2. OP OUTROS (status: CONCLUIDA) -- secundária, já finalizada

No arquivo `src/pages/FilaMestre.tsx`, linha 230, o código usa `ordens.find(o => o.pedido_id === p.id)` que retorna a **primeira** OP encontrada. Quando a OP OUTROS (CONCLUIDA) aparece antes da OP SINTETICO na lista, o card exibe "Concluída" e as etapas da OP errada (incluindo "Produção Finalizada").

### Solução

**Arquivo: `src/pages/FilaMestre.tsx`** (linha ~230)

Substituir o `ordens.find()` simples por uma lógica de priorização:

1. Buscar todas as ordens do pedido (não apenas a primeira)
2. Priorizar a ordem **principal** (tipo != OUTROS) sobre a secundária
3. Entre as principais, priorizar a que está EM_ANDAMENTO > AGUARDANDO > CONCLUIDA
4. Usar as etapas da ordem selecionada

Mudança de ~10 linhas no bloco de mapeamento de vendas. A lógica:

```text
todas_ordens_do_pedido = ordens.filter(pedido_id)
ordem = priorizar:
  1. EM_ANDAMENTO e tipo != OUTROS
  2. AGUARDANDO e tipo != OUTROS  
  3. qualquer EM_ANDAMENTO
  4. qualquer AGUARDANDO
  5. fallback: primeira encontrada
```

Isso garante que o card sempre reflita a OP principal ativa, não a OP OUTROS concluída.

### Impacto
- Corrige também qualquer outro pedido com múltiplas OPs (ex: 3103921 que tem TECIDO + OUTROS)
- Sem mudança de banco de dados
- Arquivo único: `src/pages/FilaMestre.tsx`

