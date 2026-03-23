ALTER TABLE public.ordens_producao 
  ALTER COLUMN data_inicio_pcp TYPE timestamptz USING data_inicio_pcp::timestamptz,
  ALTER COLUMN data_fim_pcp TYPE timestamptz USING data_fim_pcp::timestamptz;