
-- Add VALIDADO_FINANCEIRO to status_pedido enum (other values already exist)
ALTER TYPE public.status_pedido ADD VALUE IF NOT EXISTS 'VALIDADO_FINANCEIRO';

-- Create pedido_financeiro table
CREATE TABLE public.pedido_financeiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE UNIQUE,
  confirmado_por uuid REFERENCES public.usuarios(id),
  pagamento_confirmado boolean NOT NULL DEFAULT false,
  data_confirmacao timestamptz,
  forma_pagamento_confirmada text,
  observacao text,
  motivo_bloqueio text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedido_financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pedido_financeiro" ON public.pedido_financeiro FOR SELECT TO authenticated USING (true);
CREATE POLICY "Financeiro/admin/gestor can insert pedido_financeiro" ON public.pedido_financeiro FOR INSERT TO authenticated WITH CHECK (get_user_perfil() = ANY (ARRAY['admin', 'gestor', 'financeiro']));
CREATE POLICY "Financeiro/admin/gestor can update pedido_financeiro" ON public.pedido_financeiro FOR UPDATE TO authenticated USING (get_user_perfil() = ANY (ARRAY['admin', 'gestor', 'financeiro']));

-- Create pedido_logistica table
CREATE TABLE public.pedido_logistica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE UNIQUE,
  responsavel_envio_id uuid REFERENCES public.usuarios(id),
  data_envio timestamptz,
  codigo_rastreio text,
  transportadora text,
  data_entrega_confirmada timestamptz,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedido_logistica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pedido_logistica" ON public.pedido_logistica FOR SELECT TO authenticated USING (true);
CREATE POLICY "Logistica/admin/gestor can insert pedido_logistica" ON public.pedido_logistica FOR INSERT TO authenticated WITH CHECK (get_user_perfil() = ANY (ARRAY['admin', 'gestor', 'logistica']));
CREATE POLICY "Logistica/admin/gestor can update pedido_logistica" ON public.pedido_logistica FOR UPDATE TO authenticated USING (get_user_perfil() = ANY (ARRAY['admin', 'gestor', 'logistica']));
