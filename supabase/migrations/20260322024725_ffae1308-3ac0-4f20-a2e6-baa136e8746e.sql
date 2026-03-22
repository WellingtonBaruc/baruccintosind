
-- 1. Create pcp_configuracao table
CREATE TABLE public.pcp_configuracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_produto text NOT NULL UNIQUE,
  lead_time_dias integer NOT NULL DEFAULT 2,
  pipeline_id uuid REFERENCES public.pipeline_producao(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pcp_configuracao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read pcp_configuracao" ON public.pcp_configuracao
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage pcp_configuracao" ON public.pcp_configuracao
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 2. Add new fields to pedidos
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS lead_time_preparacao_dias integer,
  ADD COLUMN IF NOT EXISTS data_inicio_producao_necessaria date,
  ADD COLUMN IF NOT EXISTS status_prazo text DEFAULT 'NO_PRAZO';

-- 3. Add new fields to ordens_producao
ALTER TABLE public.ordens_producao
  ADD COLUMN IF NOT EXISTS sugestao_tipo_confirmada boolean DEFAULT false;

-- 4. Create op_etapa_subetapas table for Preparação checklist
CREATE TABLE public.op_etapa_subetapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_etapa_id uuid NOT NULL REFERENCES public.op_etapas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  concluida boolean DEFAULT false,
  operadores_ids uuid[] DEFAULT '{}',
  quantidade_produzida integer DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.op_etapa_subetapas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read op_etapa_subetapas" ON public.op_etapa_subetapas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Production roles can manage op_etapa_subetapas" ON public.op_etapa_subetapas
  FOR ALL TO authenticated 
  USING (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao', 'operador_producao'))
  WITH CHECK (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao', 'operador_producao'));

-- 5. Create op_etapa_corte_grupos for Corte grouping
CREATE TABLE public.op_etapa_corte_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_etapa_id uuid NOT NULL REFERENCES public.op_etapas(id) ON DELETE CASCADE,
  largura text,
  material text,
  tamanho text,
  cor text,
  quantidade_total integer DEFAULT 0,
  iniciado boolean DEFAULT false,
  concluido boolean DEFAULT false,
  itens jsonb DEFAULT '[]',
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.op_etapa_corte_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read op_etapa_corte_grupos" ON public.op_etapa_corte_grupos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Production roles can manage op_etapa_corte_grupos" ON public.op_etapa_corte_grupos
  FOR ALL TO authenticated 
  USING (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao', 'operador_producao'))
  WITH CHECK (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao', 'operador_producao'));

-- 6. Create op_etapa_montagem_operadores for Montagem
CREATE TABLE public.op_etapa_montagem_operadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_etapa_id uuid NOT NULL REFERENCES public.op_etapas(id) ON DELETE CASCADE,
  operador_id uuid NOT NULL REFERENCES public.usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.op_etapa_montagem_operadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read op_etapa_montagem_operadores" ON public.op_etapa_montagem_operadores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Production roles can manage op_etapa_montagem_operadores" ON public.op_etapa_montagem_operadores
  FOR ALL TO authenticated 
  USING (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao', 'operador_producao'))
  WITH CHECK (get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao', 'operador_producao'));

-- 7. Add fivelas_recebidas flag to ordens_producao
ALTER TABLE public.ordens_producao
  ADD COLUMN IF NOT EXISTS fivelas_recebidas boolean DEFAULT false;
