
-- Enums
CREATE TYPE public.status_pedido AS ENUM (
  'AGUARDANDO_PRODUCAO', 'EM_PRODUCAO', 'PRODUCAO_CONCLUIDA',
  'AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL', 'AGUARDANDO_FINANCEIRO',
  'LIBERADO_LOGISTICA', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE',
  'BLOQUEADO', 'CANCELADO'
);

CREATE TYPE public.status_ordem AS ENUM (
  'AGUARDANDO', 'EM_ANDAMENTO', 'CONCLUIDA', 'REJEITADA', 'CANCELADA'
);

CREATE TYPE public.status_op_etapa AS ENUM (
  'PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'REJEITADA'
);

CREATE TYPE public.tipo_acao_historico AS ENUM (
  'TRANSICAO', 'EDICAO', 'COMENTARIO', 'REJEICAO', 'APROVACAO'
);

-- Table: pedidos
CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido TEXT NOT NULL UNIQUE,
  api_venda_id TEXT UNIQUE,
  status_atual status_pedido NOT NULL DEFAULT 'AGUARDANDO_PRODUCAO',
  cliente_nome TEXT NOT NULL,
  cliente_cpf_cnpj TEXT,
  cliente_telefone TEXT,
  cliente_email TEXT,
  cliente_endereco TEXT,
  vendedor_nome TEXT,
  valor_bruto NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_desconto NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_liquido NUMERIC(12,2) NOT NULL DEFAULT 0,
  forma_pagamento TEXT,
  forma_envio TEXT,
  pagamento_confirmado BOOLEAN NOT NULL DEFAULT false,
  data_pagamento_confirmado DATE,
  codigo_rastreio TEXT,
  data_envio DATE,
  data_entrega DATE,
  observacao_comercial TEXT,
  observacao_financeiro TEXT,
  observacao_logistica TEXT,
  usuario_responsavel_id UUID REFERENCES public.usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: pedido_itens
CREATE TABLE public.pedido_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_api_id TEXT,
  descricao_produto TEXT NOT NULL,
  unidade_medida TEXT DEFAULT 'UN',
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- Table: ordens_producao
CREATE TABLE public.ordens_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipeline_producao(id),
  sequencia INTEGER NOT NULL DEFAULT 1,
  status status_ordem NOT NULL DEFAULT 'AGUARDANDO',
  tipo_produto TEXT,
  observacao TEXT,
  supervisor_id UUID REFERENCES public.usuarios(id),
  aprovado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: op_etapas
CREATE TABLE public.op_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  pipeline_etapa_id UUID REFERENCES public.pipeline_etapas(id),
  nome_etapa TEXT NOT NULL,
  ordem_sequencia INTEGER NOT NULL DEFAULT 0,
  status status_op_etapa NOT NULL DEFAULT 'PENDENTE',
  operador_id UUID REFERENCES public.usuarios(id),
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  observacao TEXT,
  motivo_rejeicao TEXT
);

-- Table: pedido_historico
CREATE TABLE public.pedido_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id),
  tipo_acao tipo_acao_historico NOT NULL,
  status_anterior TEXT,
  status_novo TEXT,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.op_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_historico ENABLE ROW LEVEL SECURITY;

-- Helper: get user perfil
CREATE OR REPLACE FUNCTION public.get_user_perfil()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT perfil::text FROM public.usuarios WHERE id = auth.uid() AND ativo = true;
$$;

-- RLS: pedidos - all authenticated can read, admin/gestor can insert/update
CREATE POLICY "Auth users can read pedidos" ON public.pedidos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor can insert pedidos" ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (public.get_user_perfil() IN ('admin', 'gestor'));
CREATE POLICY "Auth users can update pedidos" ON public.pedidos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin can delete pedidos" ON public.pedidos FOR DELETE TO authenticated USING (public.is_admin());

-- RLS: pedido_itens
CREATE POLICY "Auth users can read pedido_itens" ON public.pedido_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor can insert pedido_itens" ON public.pedido_itens FOR INSERT TO authenticated
  WITH CHECK (public.get_user_perfil() IN ('admin', 'gestor'));
CREATE POLICY "Admin/gestor can update pedido_itens" ON public.pedido_itens FOR UPDATE TO authenticated
  USING (public.get_user_perfil() IN ('admin', 'gestor'));
CREATE POLICY "Admin can delete pedido_itens" ON public.pedido_itens FOR DELETE TO authenticated USING (public.is_admin());

-- RLS: ordens_producao
CREATE POLICY "Auth users can read ordens" ON public.ordens_producao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor can insert ordens" ON public.ordens_producao FOR INSERT TO authenticated
  WITH CHECK (public.get_user_perfil() IN ('admin', 'gestor'));
CREATE POLICY "Auth users can update ordens" ON public.ordens_producao FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin can delete ordens" ON public.ordens_producao FOR DELETE TO authenticated USING (public.is_admin());

-- RLS: op_etapas
CREATE POLICY "Auth users can read op_etapas" ON public.op_etapas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/gestor can insert op_etapas" ON public.op_etapas FOR INSERT TO authenticated
  WITH CHECK (public.get_user_perfil() IN ('admin', 'gestor'));
CREATE POLICY "Auth users can update op_etapas" ON public.op_etapas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin can delete op_etapas" ON public.op_etapas FOR DELETE TO authenticated USING (public.is_admin());

-- RLS: pedido_historico
CREATE POLICY "Auth users can read historico" ON public.pedido_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert historico" ON public.pedido_historico FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger to update atualizado_em on pedidos
CREATE OR REPLACE FUNCTION public.update_pedido_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_pedidos_timestamp
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.update_pedido_timestamp();

-- Index for performance
CREATE INDEX idx_pedidos_status ON public.pedidos(status_atual);
CREATE INDEX idx_ordens_pedido ON public.ordens_producao(pedido_id);
CREATE INDEX idx_ordens_status ON public.ordens_producao(status);
CREATE INDEX idx_op_etapas_ordem ON public.op_etapas(ordem_id);
CREATE INDEX idx_historico_pedido ON public.pedido_historico(pedido_id);
