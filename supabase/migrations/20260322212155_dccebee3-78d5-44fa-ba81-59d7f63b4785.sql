
-- Table for loss tracking
CREATE TABLE public.ordem_perdas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id uuid NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  pedido_item_id uuid REFERENCES public.pedido_itens(id),
  nm_item text NOT NULL,
  quantidade_perdida integer NOT NULL DEFAULT 0,
  motivo text NOT NULL,
  etapa text NOT NULL,
  registrado_por uuid REFERENCES public.usuarios(id),
  confirmado_por uuid REFERENCES public.usuarios(id),
  status text NOT NULL DEFAULT 'PENDENTE_CONFIRMACAO',
  criado_em timestamptz NOT NULL DEFAULT now(),
  confirmado_em timestamptz
);

ALTER TABLE public.ordem_perdas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read ordem_perdas" ON public.ordem_perdas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Production roles can insert ordem_perdas" ON public.ordem_perdas FOR INSERT TO authenticated WITH CHECK (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao','operador_producao']));
CREATE POLICY "Production roles can update ordem_perdas" ON public.ordem_perdas FOR UPDATE TO authenticated USING (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao']));

-- Piloto fields on pedidos
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS is_piloto boolean DEFAULT false;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS status_piloto text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS observacao_piloto text;
