

## Plano: Corrigir build + Atualizar sync-simplifica + Aplicar migration SQL

### 1. Corrigir build error em ConfigurarPcpDialog.tsx (linha 167)

**Problema:** `{ [field]: newVal }` gera tipo dinâmico que TypeScript rejeita.

**Correção:** Substituir linha 167 por condicional explícito:
```typescript
const updateData = field === 'sabado_ativo'
  ? { sabado_ativo: newVal, atualizado_em: new Date().toISOString() }
  : { domingo_ativo: newVal, atualizado_em: new Date().toISOString() };
await supabase.from('pcp_config_semana').update(updateData).eq('id', config.id);
```

### 2. Atualizar edge function sync-simplifica

Substituir o arquivo `supabase/functions/sync-simplifica/index.ts` com o código completo que o usuário forneceu, que inclui:
- `AGUARDANDO_CIENCIA_COMERCIAL` nos `terminalStates` e `postLojaStates`
- `API_URL` via `Deno.env.get('SIMPLIFICA_API_URL')` em vez de hardcoded

**Pré-requisito:** Verificar se o secret `SIMPLIFICA_API_URL` existe. Se não, será necessário adicioná-lo antes do deploy.

### 3. Aplicar migration SQL

Executar via migration tool o SQL fornecido pelo usuário:
- **Sequence** `pedido_numero_seq` + função `next_numero_pedido()` para gerar números atômicos
- **Cron job** a cada 5 minutos para sincronização automática (substituindo o de 15 min)
- **Realtime** habilitado nas tabelas `pedidos`, `ordens_producao`, `op_etapas`, `pedido_itens`

**Nota sobre o cron:** O SQL usa `current_setting('app.supabase_url')` que pode não estar configurado. Será necessário usar a URL e anon key diretamente no SQL do cron, seguindo o padrão do Lovable Cloud.

### Ordem de execução

1. Fix build error (ConfigurarPcpDialog.tsx)
2. Criar secret `SIMPLIFICA_API_URL` se necessário
3. Atualizar e deploy da edge function sync-simplifica
4. Aplicar migration SQL (sequence + cron + realtime)

