-- Add almoxarifado to perfil_usuario enum
ALTER TYPE public.perfil_usuario ADD VALUE IF NOT EXISTS 'almoxarifado';

-- Add fivelas_separadas fields to pedidos
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS fivelas_separadas boolean DEFAULT false;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS fivelas_separadas_em timestamptz;