

## Diagnóstico

Quando o almoxarifado confirma separação (`handleConfirmarSeparacao`):
1. Marca `fivelas_separadas = true` no pedido
2. Marca solicitações como `ATENDIDO`
3. Registra histórico

**Problemas identificados:**
- A **Loja** não é notificada — a página `VerificacaoLoja.tsx` verifica `solicitacoes.every(s => s.status === 'ATENDIDA')` mas o Almoxarifado está gravando `'ATENDIDO'` (masculino) em vez de `'ATENDIDA'` (feminino). Isso impede que a loja reconheça as solicitações como atendidas.
- No Almoxarifado, o card fica com cor `bg-muted` quando separado, mas não tem destaque visual claro de "SEPARADO".
- A Loja tem realtime subscription para atualizar quando solicitações mudam, mas o status inconsistente (`ATENDIDO` vs `ATENDIDA`) quebra a lógica.

## Plano de Correção

### 1. Corrigir status da solicitação no Almoxarifado (arquivo `src/pages/Almoxarifado.tsx`)

Na função `handleConfirmarSeparacao`, alterar:
- `status: 'ATENDIDO'` → `status: 'ATENDIDA'`

Isso alinha com o que a Loja espera em `VerificacaoLoja.tsx` linha 108: `solicitacoes.every(s => s.status === 'ATENDIDA')`.

### 2. Adicionar indicador visual "SEPARADO" no card do Almoxarifado

Quando `fivelas_separadas = true`:
- Card com fundo verde claro e badge "Separado ✓" no cabeçalho
- Botão de confirmação desaparece (já funciona assim)

### 3. Adicionar badge "Fivelas Separadas ✓" na Fila da Loja e Verificação Loja

**Arquivo `src/pages/VerificacaoLoja.tsx`:**
- Quando `pedido.fivelas_separadas === true`, exibir badge verde "Fivelas Separadas ✓" no cabeçalho do pedido
- Quando todas as solicitações forem `ATENDIDA`, habilitar botão de finalização

**Arquivo `src/pages/FilaLoja.tsx`:**
- Na listagem, mostrar ícone/badge indicando que as fivelas já foram separadas para pedidos com `fivelas_separadas = true`

### Detalhes técnicos

- **Mudança crítica**: `'ATENDIDO'` → `'ATENDIDA'` em `src/pages/Almoxarifado.tsx` linha 169
- Adicionar `fivelas_separadas` ao select da `FilaLoja.tsx`
- Badge na VerificacaoLoja usando o campo `pedido.fivelas_separadas`
- Nenhuma alteração de banco de dados necessária

