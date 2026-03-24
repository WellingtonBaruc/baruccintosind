
CREATE TABLE public.pedido_item_obs_corte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_item_id uuid NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  observacao text NOT NULL,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  lido boolean NOT NULL DEFAULT false,
  lido_em timestamptz,
  lido_por uuid
);

ALTER TABLE public.pedido_item_obs_corte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pedido_item_obs_corte"
  ON public.pedido_item_obs_corte FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Production roles can insert pedido_item_obs_corte"
  ON public.pedido_item_obs_corte FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao','operador_producao'])
  );

CREATE POLICY "Production and corte roles can update pedido_item_obs_corte"
  ON public.pedido_item_obs_corte FOR UPDATE
  TO authenticated
  USING (
    get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao','operador_producao'])
  );
