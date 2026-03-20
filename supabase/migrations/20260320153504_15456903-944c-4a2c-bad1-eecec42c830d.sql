
-- Enum for user profiles
CREATE TYPE public.perfil_usuario AS ENUM (
  'admin', 'gestor', 'supervisor_producao', 'operador_producao', 'comercial', 'financeiro', 'logistica'
);

-- Table: usuarios
CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  perfil perfil_usuario NOT NULL DEFAULT 'operador_producao',
  setor TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: pipeline_producao
CREATE TABLE public.pipeline_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  padrao BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: pipeline_etapas
CREATE TABLE public.pipeline_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipeline_producao(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  setor_responsavel TEXT,
  requer_supervisor BOOLEAN NOT NULL DEFAULT false,
  avanco_automatico BOOLEAN NOT NULL DEFAULT false,
  campos_obrigatorios JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS on all tables
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_etapas ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is admin (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND perfil = 'admin' AND ativo = true
  );
$$;

-- RLS Policies for usuarios
CREATE POLICY "Authenticated users can read usuarios"
  ON public.usuarios FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert usuarios"
  ON public.usuarios FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update usuarios"
  ON public.usuarios FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin can delete usuarios"
  ON public.usuarios FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- RLS Policies for pipeline_producao
CREATE POLICY "Authenticated users can read pipelines"
  ON public.pipeline_producao FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert pipelines"
  ON public.pipeline_producao FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update pipelines"
  ON public.pipeline_producao FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin can delete pipelines"
  ON public.pipeline_producao FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- RLS Policies for pipeline_etapas
CREATE POLICY "Authenticated users can read etapas"
  ON public.pipeline_etapas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert etapas"
  ON public.pipeline_etapas FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update etapas"
  ON public.pipeline_etapas FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin can delete etapas"
  ON public.pipeline_etapas FOR DELETE
  TO authenticated
  USING (public.is_admin());
