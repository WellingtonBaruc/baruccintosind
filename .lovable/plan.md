

## Problema

A venda **3104397** (PED-00273) foi cancelada no Simplifica, mas como o Simplifica não retorna mais essa venda na API, a sincronização automática não consegue atualizar o status. O pedido continua aparecendo na Fila Mestre com `status_api = 'Em Produção'` e `status_atual = EM_PRODUCAO`.

## Solução

Adicionar um botão **"Cancelar Venda"** no card da Fila Mestre (no menu de ações ou via botão dedicado) que permita ao PCP/Admin marcar manualmente uma venda como cancelada.

### Ação do botão:
1. Atualizar o pedido: `status_atual = 'CANCELADO'`, `status_api = 'Cancelado'`, `sincronizacao_bloqueada = true`
2. Cancelar todas as OPs vinculadas: `status = 'CANCELADA'`
3. Registrar no histórico (`pedido_historico`) com observação "Cancelado manualmente — venda cancelada no Simplifica"
4. O pedido deixa de aparecer na Fila Mestre (já é filtrado por `CANCELADO`)

### Detalhes técnicos:

**`src/pages/FilaMestre.tsx`**:
- Adicionar estado para o dialog de confirmação de cancelamento
- Adicionar botão "Cancelar Venda" no menu de ações do card (ao lado do botão de excluir OP PCP que já existe)
- Dialog de confirmação com campo de observação opcional
- Ao confirmar: update no `pedidos` + update em `ordens_producao` + insert no `pedido_historico`
- Bloquear sincronização (`sincronizacao_bloqueada = true`) para evitar que uma sync futura sobrescreva o cancelamento

### Para o caso imediato (PED-00273):
- Assim que o botão estiver implementado, o usuário poderá cancelar diretamente pela interface
- A venda sairá automaticamente da Fila Mestre, Kanban e todos os fluxos

