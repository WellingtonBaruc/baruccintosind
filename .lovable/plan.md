
# Corrigir “card duplicado” no Kanban

## Diagnóstico
Isto não é uma duplicação visual do React. Hoje a venda **3095425** tem **2 ordens reais** no banco:

```text
Venda 3095425
├─ Ordem original (sequencia 1) → EM_ANDAMENTO na etapa Corte
└─ OP complementar (sequencia 2) → AGUARDANDO
```

Como o Kanban mostra o card pelo `api_venda_id`, as duas ordens aparecem com o mesmo número **3095425**, dando a impressão de duplicação.

## Causa raiz
1. **`KanbanProducao.tsx`** mostra todas as ordens do pedido enquanto ele está em status da Loja.
2. A **venda mãe** continua aparecendo no Kanban mesmo após entrar em `AGUARDANDO_OP_COMPLEMENTAR`.
3. A **OP complementar** usa o mesmo `pedido_id` / `api_venda_id`, mas o card não mostra um identificador próprio de OP.
4. **`VerificacaoLoja.tsx`** ainda tenta detectar OP complementar por `tipo_produto = 'OP_COMPLEMENTAR'`, mas as novas OPs estão sendo criadas como `SINTETICO`.

## Implementação

### 1. Ajustar visibilidade no Kanban
**Arquivo:** `src/pages/KanbanProducao.tsx`

Atualizar `fetchCards()` para aplicar esta regra:

```text
Se status do pedido = AGUARDANDO_LOJA ou LOJA_VERIFICANDO
  → não mostrar nenhuma ordem no Kanban

Se status do pedido = AGUARDANDO_OP_COMPLEMENTAR ou AGUARDANDO_ALMOXARIFADO
  → mostrar somente a OP complementar
  → ocultar a ordem mãe

Nos demais status
  → manter regra atual
```

Para identificar a OP complementar, usar:
- `sequencia > 1`, e/ou
- `observacao` começando com `OP Complementar`

### 2. Mostrar número da OP no card
**Arquivo:** `src/pages/KanbanProducao.tsx`

Incluir no select e no model do card:
- `ordens_producao.sequencia`
- `ordens_producao.observacao`

Depois trocar o título do card complementar para algo como:

```text
3095425 • OP 2
```

Assim o card que vai para produção fica claramente diferente da venda mãe.

### 3. Corrigir a detecção de OP complementar na Loja
**Arquivo:** `src/pages/VerificacaoLoja.tsx`

Trocar a lógica que hoje busca:
```text
tipo_produto = 'OP_COMPLEMENTAR'
```

por uma identificação consistente com a implementação atual:
- `sequencia > 1`, ou
- `observacao` com prefixo `OP Complementar`

Isso evita a Loja ficar lendo a OP errada ou considerar que não existe OP complementar.

### 4. Corrigir o dado já corrompido da venda 3095425
Aplicar correção pontual no banco para a venda testada:

- resetar a **ordem mãe** que foi iniciada por engano no Kanban
- voltar suas etapas para `PENDENTE`
- manter a **OP complementar** como a única ordem visível para produção

## Resultado esperado
Após a correção:

```text
Venda mãe 3095425
→ permanece na Loja

OP complementar da 3095425
→ aparece sozinha no Kanban
→ entra em "Aguardando Início"
→ card mostra "3095425 • OP 2"
```

## Detalhes técnicos
- `KanbanProducao.tsx`
  - expandir select de `ordens_producao` com `sequencia` e `observacao`
  - filtrar ordens por `pedido.status_atual`
  - ocultar ordem mãe em fluxos da Loja com OP complementar
  - renderizar label de OP no card

- `VerificacaoLoja.tsx`
  - parar de depender de `tipo_produto = 'OP_COMPLEMENTAR'`
  - usar `sequencia` / `observacao` para localizar a OP complementar correta

- Banco
  - correção pontual da venda **3095425** para remover o estado inconsistente criado no teste
