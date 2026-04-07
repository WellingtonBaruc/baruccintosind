

## Plano: Atualizar sync-simplifica com reconciliação de inconsistências e janela de 7 dias

### Mudanças identificadas

Duas alterações em relação ao código atual:

### 1. Janela padrão de sincronização: 2 → 7 dias
**Arquivo:** `supabase/functions/sync-simplifica/index.ts` (linha 135)

Alterar de:
```typescript
const diasImportacao = diasOverride || (isFirstSync ? (config?.dias_importacao_inicial || 15) : 2);
```
Para:
```typescript
const diasImportacao = diasOverride || (isFirstSync ? (config?.dias_importacao_inicial || 15) : 7);
```

Isso amplia a janela de busca padrão, capturando vendas que possam ter sido perdidas em sincronizações anteriores.

### 2. Reconciliação de status inconsistentes (pedidos antigos)
**Arquivo:** `supabase/functions/sync-simplifica/index.ts` (linhas 269-300)

Substituir a lógica de `processarExistente` que atualmente só reconcilia quando `status_api` muda, para também corrigir pedidos onde `status_api` já é "Finalizado" mas o `status_atual` interno ainda está em um estado inválido. Isso resolve inconsistências acumuladas antes do cron ser ativado.

A nova lógica:
- Define `terminalStatesOk` para verificar se o estado interno já está correto
- Detecta `statusInconsistente = statusApi === 'Finalizado' && !terminalStatesOk.includes(status_atual)`
- Executa reconciliação tanto em mudança de `status_api` quanto em inconsistência detectada
- Diferencia a mensagem no histórico entre "mudança" e "correção automática"

### Execução
1. Aplicar as duas alterações no arquivo da edge function
2. Deploy da edge function

