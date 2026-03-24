

## Plano: Forçar conclusão da OP do pedido 3094097

### Situação atual

| Entidade | ID | Status |
|---|---|---|
| Pedido PED-00051 | `4fa9b82d-...` | `EM_PRODUCAO` |
| OP (Tecido, seq 1) | `8601be63-...` | `EM_ANDAMENTO` |
| Etapa 1 - Conferência | `c66dc1e5-...` | `EM_ANDAMENTO` |
| Etapa 2 - Fusionagem | `35f17fa0-...` | `PENDENTE` |
| Etapa 3 - Colagem/Viração | `19330fc5-...` | `PENDENTE` |
| Etapa 4 - Finalização | `7492860a-...` | `PENDENTE` |
| Etapa 5 - Concluído | `e0f0ca9c-...` | `PENDENTE` |

### Ações (4 updates + 1 insert, sem alteração de código)

1. **Concluir as 5 etapas** -- UPDATE `op_etapas` SET `status = 'CONCLUIDA'`, `concluido_em = now()` WHERE `ordem_id = '8601be63-...'`

2. **Concluir a OP** -- UPDATE `ordens_producao` SET `status = 'CONCLUIDA'` WHERE `id = '8601be63-...'`

3. **Avançar o pedido** -- UPDATE `pedidos` SET `status_atual = 'PRODUCAO_CONCLUIDA'` WHERE `id = '4fa9b82d-...'`

4. **Registrar historico** -- INSERT em `pedido_historico` com tipo `TRANSICAO`, de `EM_PRODUCAO` para `PRODUCAO_CONCLUIDA`, observacao explicando conclusão manual

### Resultado esperado

- Pedido sai do Kanban de Produção
- Pedido fica disponivel para o proximo fluxo (comercial/supervisor)
- Historico registrado para auditoria

