
Plano de correção

Objetivo
Ajustar o Kanban de Produção para não reexibir vendas com situação Simplifica = "Pedido Enviado" e eliminar a causa da recorrência, não só esconder o sintoma.

Diagnóstico do porquê isso persiste hoje
- A regra está espalhada e contraditória entre telas:
  - `src/pages/KanbanProducao.tsx` filtra só por `status_atual` e ignora `status_api` na visibilidade principal.
  - `src/pages/FilaMestre.tsx` tem um “backfill” de pedidos com OP ativa que pode reintroduzir pedidos fora da regra.
  - `src/pages/FilaLoja.tsx` e `src/pages/DashboardLoja.tsx` ainda usam uma lista `STATUS_POS_LOJA` incompleta, então pedidos com `status_api = Pedido Enviado` e `status_atual = EM_PRODUCAO` podem continuar aparecendo onde não deveriam.
  - `src/pages/FilaProducao.tsx` explicitamente considera `Pedido Enviado` como produção.
- A regra foi aplicada na UI, mas não na origem do dado:
  - `supabase/functions/sync-simplifica/index.ts` atualiza `status_api`, mas não reconcilia `status_atual` quando a venda volta ou permanece como `Pedido Enviado`.
  - `src/components/integracao/ImportPlanilha.tsx` cria novos pedidos com `status_atual: 'EM_PRODUCAO'` mesmo quando a situação importada pode ser `Pedido Enviado`.
- As comparações são frágeis, baseadas em strings literais, sem normalização central.

O que vou ajustar
1. Centralizar a regra de visibilidade
- Criar um helper compartilhado em `src/lib/` para decidir:
  - quando um pedido pode aparecer no Kanban de Produção;
  - quando pode aparecer na Fila Mestre;
  - quando deve aparecer só na Loja.
- A regra passará a usar conjuntamente:
  - `status_api`
  - `status_atual`
  - `ordem.sequencia`
  - contexto de OP complementar da Loja

2. Corrigir o Kanban de Produção
- Em `src/pages/KanbanProducao.tsx`, aplicar a regra centralizada antes de montar os cards.
- Bloquear pedidos com `status_api = Pedido Enviado` no Kanban.
- Manter apenas a exceção necessária de OP complementar da Loja, se a regra de negócio continuar sendo:
  - mostrar só OP complementar (`sequencia > 1`) para `AGUARDANDO_OP_COMPLEMENTAR` / `AGUARDANDO_ALMOXARIFADO`.

3. Corrigir os pontos que reintroduzem o erro
- `src/pages/FilaMestre.tsx`
  - endurecer o backfill de pedidos com OP ativa para não puxar pedidos `Pedido Enviado` indevidamente;
  - permitir apenas as exceções válidas do fluxo da Loja.
- `src/pages/FilaLoja.tsx` e `src/pages/DashboardLoja.tsx`
  - completar `STATUS_POS_LOJA` com status de produção (`AGUARDANDO_PRODUCAO`, `EM_PRODUCAO`, `PRODUCAO_CONCLUIDA`);
  - evitar duplicidade Loja x Produção.
- `src/pages/FilaProducao.tsx`
  - alinhar com a mesma regra, porque hoje essa tela ainda aceita `Pedido Enviado` explicitamente.

4. Corrigir a origem do problema
- `supabase/functions/sync-simplifica/index.ts`
  - ao detectar mudança para `Pedido Enviado`, tratar divergência entre `status_api` e `status_atual`;
  - impedir que um pedido siga “internamente em produção” sem passar pela exceção correta.
- `src/components/integracao/ImportPlanilha.tsx`
  - parar de forçar `status_atual = EM_PRODUCAO` em toda importação nova;
  - mapear o status interno conforme a situação importada.

5. Tornar a regra robusta
- Normalizar `status_api` antes de comparar (`trim`, case, acentuação se necessário).
- Substituir arrays soltos e regras duplicadas por funções compartilhadas.
- Isso evita a regressão “corrige numa tela e reaparece em outra”.

Arquivos principais
- `src/pages/KanbanProducao.tsx`
- `src/pages/FilaMestre.tsx`
- `src/pages/FilaProducao.tsx`
- `src/pages/FilaLoja.tsx`
- `src/pages/DashboardLoja.tsx`
- `src/components/integracao/ImportPlanilha.tsx`
- `supabase/functions/sync-simplifica/index.ts`
- novo helper em `src/lib/` para regra centralizada

Resultado esperado
- Pedido com situação Simplifica = `Pedido Enviado` deixa de aparecer no Kanban de Produção.
- A exceção de OP complementar fica explícita e controlada.
- A regra passa a valer em todas as telas relevantes, não só em uma.
- O erro deixa de ser recorrente porque a correção passa a atuar também na origem e não apenas na renderização.

Observação técnica importante
Hoje o problema é persistente porque existem múltiplas “verdades” no sistema:
- a integração altera `status_api`;
- a importação por planilha força `status_atual`;
- cada tela decide visibilidade com regras próprias.
A correção precisa unificar essas três camadas; se eu corrigir só o Kanban, o erro volta.
