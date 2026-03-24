
ALTER TABLE public.ordens_producao
  ADD COLUMN IF NOT EXISTS programado_inicio_data date,
  ADD COLUMN IF NOT EXISTS programado_conclusao_data date;
