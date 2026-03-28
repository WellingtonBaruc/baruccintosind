

## Plano: Mover pedido para AGUARDANDO_COMERCIAL ao clicar em "Abrir WhatsApp"

### O que muda

**Arquivo: `src/pages/KanbanProducao.tsx`**

Expandir a função `registerWhatsappReferral` (linhas 1068-1080) para:

1. **Atualizar o status do pedido** para `AGUARDANDO_COMERCIAL`:
   ```typescript
   await supabase.from('pedidos')
     .update({ status_atual: 'AGUARDANDO_COMERCIAL' })
     .eq('id', card.pedido_id);
   ```

2. **Inserir dois registros no histórico** (em vez de apenas um comentário):
   - `TRANSICAO` com `status_anterior: card.status_pedido` e `status_novo: 'AGUARDANDO_COMERCIAL'`
   - `COMENTARIO` com a observação do encaminhamento para a vendedora

3. **Recarregar o kanban** chamando `fetchCards()` após sucesso, para que o card desapareça da produção

4. **Exibir toast de confirmação**: `"Pedido enviado para o Kanban Comercial!"`

### Resultado esperado

- Ao clicar em "Abrir WhatsApp", o WhatsApp abre normalmente E o card é movido automaticamente para a coluna "Comercial" do Kanban Venda (`/kanban-venda`)
- O card desaparece do Kanban de Produção imediatamente

### Seção técnica

- O status `AGUARDANDO_COMERCIAL` já é reconhecido pelo `KanbanVenda.tsx` como pertencente à coluna "Comercial"
- A RLS permite update por perfis autorizados (admin, gestor, comercial, supervisor_producao, etc.)
- Nenhuma migração de banco necessária

