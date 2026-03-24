
CREATE TABLE public.pcp_corte_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_produto text NOT NULL,
  descricao text NOT NULL,
  largura text,
  material text,
  tamanho text,
  cor text,
  quantidade integer NOT NULL DEFAULT 0,
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'PENDENTE',
  operador_id uuid REFERENCES public.pcp_operadores_corte(id),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  observacao text
);

ALTER TABLE public.pcp_corte_manual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_corte_manual"
  ON public.pcp_corte_manual FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Production roles can manage pcp_corte_manual"
  ON public.pcp_corte_manual FOR ALL
  TO authenticated
  USING (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'supervisor_producao'::text, 'operador_producao'::text]))
  WITH CHECK (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'supervisor_producao'::text, 'operador_producao'::text]));
