ALTER TABLE public.ordens_producao ADD COLUMN IF NOT EXISTS origem_op text DEFAULT 'SISTEMA' CHECK (origem_op IN ('SISTEMA', 'LOJA', 'PCP'));
ALTER TABLE public.ordens_producao ADD COLUMN IF NOT EXISTS criado_por_id uuid REFERENCES public.usuarios(id);
ALTER TABLE public.ordens_producao ADD COLUMN IF NOT EXISTS produtos_descricao text;