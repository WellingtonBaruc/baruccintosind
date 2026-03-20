-- Add ALTERACAO_ITENS to tipo_acao_historico enum
ALTER TYPE public.tipo_acao_historico ADD VALUE IF NOT EXISTS 'ALTERACAO_ITENS';

-- Add total_ignorados column to integracao_logs
ALTER TABLE public.integracao_logs ADD COLUMN IF NOT EXISTS total_ignorados integer DEFAULT 0;