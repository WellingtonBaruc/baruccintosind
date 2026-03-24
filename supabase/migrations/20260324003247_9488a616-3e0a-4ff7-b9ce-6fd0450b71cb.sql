
CREATE TABLE public.pcp_capacidade_diaria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  capacidade_sintetico integer NOT NULL DEFAULT 0,
  capacidade_tecido integer NOT NULL DEFAULT 0,
  capacidade_total integer NOT NULL DEFAULT 0,
  observacao text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(data)
);

ALTER TABLE public.pcp_capacidade_diaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_capacidade_diaria"
  ON public.pcp_capacidade_diaria FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/gestor/supervisor can manage pcp_capacidade_diaria"
  ON public.pcp_capacidade_diaria FOR ALL TO authenticated
  USING (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao'))
  WITH CHECK (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao'));

-- Default capacity config table (fallback when no daily entry exists)
CREATE TABLE public.pcp_capacidade_padrao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capacidade_sintetico integer NOT NULL DEFAULT 30,
  capacidade_tecido integer NOT NULL DEFAULT 20,
  capacidade_total integer NOT NULL DEFAULT 50,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pcp_capacidade_padrao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_capacidade_padrao"
  ON public.pcp_capacidade_padrao FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/gestor/supervisor can manage pcp_capacidade_padrao"
  ON public.pcp_capacidade_padrao FOR ALL TO authenticated
  USING (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao'))
  WITH CHECK (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao'));

-- Insert default capacity
INSERT INTO public.pcp_capacidade_padrao (capacidade_sintetico, capacidade_tecido, capacidade_total) 
VALUES (30, 20, 50);
