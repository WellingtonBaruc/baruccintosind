
CREATE TABLE public.pcp_operadores_corte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pcp_operadores_corte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_operadores_corte"
  ON public.pcp_operadores_corte FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Production roles can manage pcp_operadores_corte"
  ON public.pcp_operadores_corte FOR ALL TO authenticated
  USING (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao','operador_producao']))
  WITH CHECK (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao','operador_producao']));

-- Update pcp_corte_registro to reference this table instead
ALTER TABLE public.pcp_corte_registro DROP CONSTRAINT IF EXISTS pcp_corte_registro_operador_id_fkey;
ALTER TABLE public.pcp_corte_registro ADD CONSTRAINT pcp_corte_registro_operador_id_fkey
  FOREIGN KEY (operador_id) REFERENCES public.pcp_operadores_corte(id);
