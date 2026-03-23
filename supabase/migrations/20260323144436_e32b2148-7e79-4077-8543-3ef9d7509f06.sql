
-- Lead Times configuráveis por tipo de produto
CREATE TABLE public.pcp_lead_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  lead_time_dias integer NOT NULL DEFAULT 2,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pcp_lead_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_lead_times" ON public.pcp_lead_times FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor can manage pcp_lead_times" ON public.pcp_lead_times FOR ALL TO authenticated USING (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao'])) WITH CHECK (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao']));

-- Pré-cadastrar tipos
INSERT INTO public.pcp_lead_times (tipo, lead_time_dias) VALUES
  ('SINTETICO', 5),
  ('TECIDO', 7),
  ('FIVELA_COBERTA', 3);

-- Feriados
CREATE TABLE public.pcp_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'Nacional',
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pcp_feriados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_feriados" ON public.pcp_feriados FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor can manage pcp_feriados" ON public.pcp_feriados FOR ALL TO authenticated USING (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao'])) WITH CHECK (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao']));

-- Pausas operacionais
CREATE TABLE public.pcp_pausas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  motivo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pcp_pausas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_pausas" ON public.pcp_pausas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor can manage pcp_pausas" ON public.pcp_pausas FOR ALL TO authenticated USING (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao'])) WITH CHECK (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao']));

-- Configuração de semana (dias não produtivos)
CREATE TABLE public.pcp_config_semana (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sabado_ativo boolean NOT NULL DEFAULT false,
  domingo_ativo boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pcp_config_semana ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_config_semana" ON public.pcp_config_semana FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor can manage pcp_config_semana" ON public.pcp_config_semana FOR ALL TO authenticated USING (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao'])) WITH CHECK (get_user_perfil() = ANY (ARRAY['admin','gestor','supervisor_producao']));

-- Insert default config
INSERT INTO public.pcp_config_semana (sabado_ativo, domingo_ativo) VALUES (false, false);
