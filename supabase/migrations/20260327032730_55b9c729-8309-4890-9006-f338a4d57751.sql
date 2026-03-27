
-- Add soft delete columns to pedidos for PCP OPs
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
