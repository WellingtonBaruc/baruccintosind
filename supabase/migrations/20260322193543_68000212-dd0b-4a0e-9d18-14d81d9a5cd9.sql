ALTER TABLE public.ordens_producao 
ADD COLUMN IF NOT EXISTS data_inicio_pcp date,
ADD COLUMN IF NOT EXISTS data_fim_pcp date;