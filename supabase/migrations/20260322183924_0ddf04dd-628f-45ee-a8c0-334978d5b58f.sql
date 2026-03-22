ALTER TABLE ordens_producao ADD COLUMN IF NOT EXISTS programado_para_hoje boolean DEFAULT false;
ALTER TABLE ordens_producao ADD COLUMN IF NOT EXISTS data_programacao date;