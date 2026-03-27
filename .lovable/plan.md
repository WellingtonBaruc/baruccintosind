
Objetivo

Corrigir de forma definitiva o botão “Enviar para o Comercial” para que o WhatsApp só seja aberto externamente, em nova aba, usando `https://wa.me/...`, sem depender de fluxo interno que possa ser bloqueado pelo preview.

Achados da auditoria

- Busquei no projeto por:
  - `api.whatsapp.com`
  - `whatsapp.com/send`
  - `iframe`
  - `embed`
  - `router.push`
  - `window.location.href`
- Resultado:
  - Não existe `api.whatsapp.com` nem `whatsapp.com/send` no código atual.
  - Não há `iframe` nem `embed` carregando WhatsApp.
  - O único fluxo de WhatsApp encontrado está em `src/pages/KanbanProducao.tsx`.
  - O único botão “Enviar para o Comercial” também está em `src/pages/KanbanProducao.tsx`.
- O código atual monta `wa.me`, mas abre via fluxo indireto:
  - `DropdownMenu`
  - `prepareWhatsappContext()` assíncrono
  - `DropdownMenuItem onSelect`
  - `event.preventDefault()`
  - `document.createElement('a')` + `link.click()`
- Do I know what the issue is?
  - Sim.
  - O problema não é mais uma string fixa `api.whatsapp.com` no projeto.
  - O problema é que o clique final não está acontecendo como navegação externa nativa e direta do usuário. Ele passa por dropdown + estado assíncrono + seleção programática. Nesse contexto, `wa.me` redireciona para `api.whatsapp.com` e o ambiente do preview/webview bloqueia a resposta, gerando `ERR_BLOCKED_BY_RESPONSE`.

Plano de correção

1. Remover o fluxo indireto atual do WhatsApp
- Eliminar de `KanbanProducao.tsx` a dependência de:
  - `prepareWhatsappContext`
  - `whatsappLoading`
  - `whatsappPedidoData`
  - `handleWhatsappSelection`
  - `openWhatsApp` programático no caminho principal
  - `DropdownMenuItem onSelect` com `preventDefault`
- Isso tira do caminho tudo que pode “quebrar” o gesto nativo do clique.

2. Trazer os dados da mensagem para o card desde a carga inicial
- Hoje a mensagem depende de um fetch extra em `pedidos` quando o menu abre.
- Vou incluir no carregamento inicial do kanban os campos necessários para montar a mensagem:
  - `numero_pedido`
  - `cliente_telefone`
  - `cliente_endereco`
  - `canal_venda`
  - `valor_liquido`
  - `observacao_comercial`
  - além dos que já existem
- Assim, a URL do WhatsApp fica pronta antes do clique.

3. Substituir o dropdown por uma lista inline de links reais
- Em vez de `DropdownMenu`, usar uma expansão inline simples no próprio card.
- Cada vendedora será renderizada como um `<a>` real, por exemplo:
  - `href="https://wa.me/..."`
  - `target="_blank"`
  - `rel="noopener noreferrer"`
- O usuário clicará diretamente no link real da vendedora.
- Sem modal, sem drawer, sem iframe, sem portal de dropdown, sem navegação interna.

4. Montar a URL exatamente no padrão exigido
- Para cada link:
  - limpar número com `replace(/\D/g, "")`
  - codificar texto com `encodeURIComponent`
  - gerar `https://wa.me/NUMERO?text=MENSAGEM`
- A mensagem automática será mantida preenchida como hoje.

5. Registrar histórico sem bloquear a abertura externa
- O clique no link vai abrir primeiro a nova aba.
- O registro em `pedido_historico` será disparado de forma não bloqueante no `onClick`, sem `preventDefault` e sem interferir na navegação externa.
- Se houver falha no registro, o WhatsApp ainda abre normalmente.

6. Endurecer a validação do fluxo
- Se faltar telefone da vendedora ou dados mínimos, desabilitar o link daquela opção e mostrar aviso claro.
- Adicionar fallback de “copiar link”/“copiar mensagem” se necessário para ambientes mais restritivos.
- Isso é mais confiável do que tentar detectar popup blocker em link nativo.

7. Garantir atualização real da versão publicada
- Após a correção, publicar novamente para gerar novo `version.json`.
- O projeto já usa versionamento automático no build (`vite.config.ts`).
- Isso força preview/publicação a carregarem o bundle novo e evita teste em build antigo.

Validação após implementar

- Refazer a busca global e confirmar:
  - zero referências a `api.whatsapp.com`
  - zero referências a `whatsapp.com/send`
  - zero uso de iframe/embed no fluxo
- Confirmar que o botão “Enviar para o Comercial” só existe em `src/pages/KanbanProducao.tsx`.
- Testar o fluxo esperado:
  1. clicar em “Enviar para o Comercial”
  2. expandir a lista inline
  3. clicar diretamente na vendedora
  4. abrir nova aba externa com `wa.me`
  5. mensagem já preenchida
  6. sem navegação interna do app
  7. sem `ERR_BLOCKED_BY_RESPONSE`

Arquivos principais a alterar

- `src/pages/KanbanProducao.tsx`
- possivelmente tipos/estrutura local do card dentro do mesmo arquivo
- `public/version.json` será renovado automaticamente no novo publish

Resumo técnico

```text
Problema real:
Dropdown/estado assíncrono/seleção programática fazem o clique deixar de ser
uma navegação externa nativa do usuário.

Correção:
pré-carregar os dados + trocar dropdown por lista inline + usar <a real>
com href wa.me target=_blank rel=noopener noreferrer.
```
