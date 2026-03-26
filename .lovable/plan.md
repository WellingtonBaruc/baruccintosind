

# Correção: Comercial não consegue finalizar venda (página em branco)

## Causa raiz identificada

As políticas de segurança (RLS) das tabelas `pedidos`, `pedido_itens`, `ordens_producao` e `op_etapas` só permitem INSERT para `admin` e `gestor`. Quando um usuário com perfil `comercial` tenta criar uma venda na tela "Nova Venda" (`/comercial/nova-venda`), o INSERT falha silenciosamente com violação de RLS, causando erro e potencialmente uma página em branco.

**Evidência**: A página `NovaVendaComercial.tsx` permite acesso ao perfil `comercial` (linha 109), mas as tabelas não permitem que ele insira dados.

## Plano de correção

### 1. Atualizar RLS — permitir INSERT do perfil comercial (migração SQL)

Adicionar `comercial` às políticas de INSERT das 4 tabelas envolvidas na criação de venda:

- **pedidos**: `Admin/gestor can insert pedidos` → adicionar `'comercial'`
- **pedido_itens**: `Admin/gestor can insert pedido_itens` → adicionar `'comercial'`
- **ordens_producao**: `Admin/gestor can insert ordens` → adicionar `'comercial'`
- **op_etapas**: `Admin/gestor can insert op_etapas` → adicionar `'comercial'`

### 2. Adicionar tratamento de erro no `handleCiente` (KanbanVenda.tsx)

A função `handleCiente` (linha 268) não tem try/catch nem verificação de erro. Adicionar tratamento para evitar falhas silenciosas.

### 3. Adicionar tratamento de erro robusto no `NovaVendaComercial.tsx`

Melhorar o catch block para mostrar mensagens mais claras quando ocorre erro de permissão, evitando que o usuário fique perdido.

## Detalhes técnicos

**Migração SQL** — 4 políticas atualizadas com `DROP POLICY` + `CREATE POLICY` incluindo `'comercial'` no array de perfis permitidos.

**Arquivos editados**:
- `src/pages/KanbanVenda.tsx` — error handling no `handleCiente`
- `src/pages/NovaVendaComercial.tsx` — melhorar mensagens de erro

