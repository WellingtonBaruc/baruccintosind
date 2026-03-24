
CREATE TABLE public.pcp_corte_registro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_produto TEXT NOT NULL,
  largura TEXT NOT NULL,
  material TEXT NOT NULL,
  tamanho TEXT NOT NULL,
  cor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  operador_id UUID REFERENCES public.usuarios(id),
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_pcp_corte_registro_key ON public.pcp_corte_registro (tipo_produto, largura, material, tamanho, cor);

ALTER TABLE public.pcp_corte_registro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_corte_registro"
  ON public.pcp_corte_registro FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Production roles can manage pcp_corte_registro"
  ON public.pcp_corte_registro FOR ALL TO authenticated
  USING (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao','operador_producao']))
  WITH CHECK (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao','operador_producao']));
