
-- New columns on pedidos for API mapping
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS data_venda_api date,
  ADD COLUMN IF NOT EXISTS data_previsao_entrega date,
  ADD COLUMN IF NOT EXISTS data_entrega_api date,
  ADD COLUMN IF NOT EXISTS api_cliente_id text,
  ADD COLUMN IF NOT EXISTS vendedor_codigo text,
  ADD COLUMN IF NOT EXISTS canal_venda text,
  ADD COLUMN IF NOT EXISTS valor_produtos numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_frete numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_acrescimo numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao_api text,
  ADD COLUMN IF NOT EXISTS observacao_interna_api text;

-- New columns on pedido_itens for API mapping
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS api_item_id text,
  ADD COLUMN IF NOT EXISTS referencia_produto text,
  ADD COLUMN IF NOT EXISTS categoria_produto text,
  ADD COLUMN IF NOT EXISTS valor_unitario_liquido numeric DEFAULT 0;

-- Integration configuration table (single row)
CREATE TABLE public.integracao_configuracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativa boolean NOT NULL DEFAULT false,
  intervalo_minutos integer NOT NULL DEFAULT 15,
  dias_importacao_inicial integer NOT NULL DEFAULT 15,
  ultima_sincronizacao timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integracao_configuracao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage integracao_configuracao select"
  ON public.integracao_configuracao FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert integracao_configuracao"
  ON public.integracao_configuracao FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update integracao_configuracao"
  ON public.integracao_configuracao FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can delete integracao_configuracao"
  ON public.integracao_configuracao FOR DELETE
  TO authenticated
  USING (is_admin());

-- Insert default config row
INSERT INTO public.integracao_configuracao (ativa, intervalo_minutos, dias_importacao_inicial) VALUES (false, 15, 15);

-- Integration logs table
CREATE TABLE public.integracao_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'MANUAL',
  status text NOT NULL DEFAULT 'SUCESSO',
  total_recebidos integer DEFAULT 0,
  total_inseridos integer DEFAULT 0,
  total_atualizados integer DEFAULT 0,
  total_erros integer DEFAULT 0,
  paginas_processadas integer DEFAULT 0,
  erro_detalhes text,
  duracao_ms integer DEFAULT 0,
  executado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integracao_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read integracao_logs"
  ON public.integracao_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert integracao_logs"
  ON public.integracao_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Anon can insert integracao_logs"
  ON public.integracao_logs FOR INSERT
  TO anon
  WITH CHECK (true);
