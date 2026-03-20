
-- 1. Add new status values to enum
ALTER TYPE public.status_pedido ADD VALUE IF NOT EXISTS 'AGUARDANDO_LOJA';
ALTER TYPE public.status_pedido ADD VALUE IF NOT EXISTS 'LOJA_VERIFICANDO';
ALTER TYPE public.status_pedido ADD VALUE IF NOT EXISTS 'AGUARDANDO_OP_COMPLEMENTAR';
ALTER TYPE public.status_pedido ADD VALUE IF NOT EXISTS 'AGUARDANDO_ALMOXARIFADO';
ALTER TYPE public.status_pedido ADD VALUE IF NOT EXISTS 'LOJA_OK';

-- 2. Add new profile value
ALTER TYPE public.perfil_usuario ADD VALUE IF NOT EXISTS 'loja';

-- 3. Add columns to pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_fluxo text,
  ADD COLUMN IF NOT EXISTS sincronizacao_bloqueada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subtipo_pronta_entrega text,
  ADD COLUMN IF NOT EXISTS status_api text;

-- 4. Add columns to pedido_itens for loja verification
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS observacao_producao text,
  ADD COLUMN IF NOT EXISTS conferido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disponivel boolean,
  ADD COLUMN IF NOT EXISTS item_faltante_tipo text;

-- 5. Create solicitacoes_almoxarifado table for path C/D
CREATE TABLE IF NOT EXISTS public.solicitacoes_almoxarifado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  pedido_item_id uuid REFERENCES public.pedido_itens(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDENTE',
  solicitado_por uuid REFERENCES public.usuarios(id),
  atendido_por uuid REFERENCES public.usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atendido_em timestamptz
);

ALTER TABLE public.solicitacoes_almoxarifado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read solicitacoes"
  ON public.solicitacoes_almoxarifado FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Loja/admin/gestor can insert solicitacoes"
  ON public.solicitacoes_almoxarifado FOR INSERT TO authenticated
  WITH CHECK (get_user_perfil() IN ('admin','gestor','loja'));

CREATE POLICY "Loja/admin/gestor can update solicitacoes"
  ON public.solicitacoes_almoxarifado FOR UPDATE TO authenticated
  USING (get_user_perfil() IN ('admin','gestor','loja','supervisor_producao'));

-- 6. Update pedido_itens RLS to allow loja updates (conferido, disponivel)
CREATE POLICY "Loja can update pedido_itens verification"
  ON public.pedido_itens FOR UPDATE TO authenticated
  USING (get_user_perfil() IN ('loja'));

-- 7. Allow loja to update pedidos status
DROP POLICY IF EXISTS "Authorized roles can update pedidos" ON public.pedidos;
CREATE POLICY "Authorized roles can update pedidos"
  ON public.pedidos FOR UPDATE TO authenticated
  USING (get_user_perfil() IN ('admin','gestor','comercial','financeiro','logistica','supervisor_producao','loja'));
