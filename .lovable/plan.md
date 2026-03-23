

# Corrigir botão "Enviar para o Comercial" não aparecendo

## Problema

A função `canSendToComercial` verifica se `pedido_status` é exatamente `'EM_PRODUCAO'` ou `'PRODUCAO_CONCLUIDA'`. Pedidos que estão com outros status (como `'AGUARDANDO_LOJA'`, `'LOJA_OK'`, etc.) não mostram o botão, mesmo estando com a ordem concluída no Kanban.

## Correção

**Arquivo: `src/pages/KanbanProducao.tsx`**

Inverter a lógica de `canSendToComercial`: em vez de listar os status permitidos, excluir os status que já passaram do comercial:

```typescript
const canSendToComercial = (card: KanbanCard) => {
  const alreadySent = ['AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL', 
    'AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO', 'LIBERADO_LOGISTICA',
    'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE', 'CANCELADO'].includes(card.pedido_status);
  return card.ordem_status === 'CONCLUIDA' && !alreadySent && isSupervisor;
};
```

Isso garante que qualquer pedido com ordem concluída, que ainda não tenha sido enviado ao comercial, mostre o botão — independente do status intermediário do pedido.

