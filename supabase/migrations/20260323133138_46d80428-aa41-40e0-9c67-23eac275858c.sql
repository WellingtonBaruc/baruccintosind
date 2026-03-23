-- Fix corrupted data for order 3095425 (both ordens)
UPDATE ordens_producao SET status = 'AGUARDANDO'
WHERE id IN ('208f39d8-d72a-44a8-a48c-72bf43e4ca3d', 'cb9b5cae-b3fd-4ace-902a-5e74391ad049');

UPDATE op_etapas SET status = 'PENDENTE', concluido_em = NULL, iniciado_em = NULL, operador_id = NULL
WHERE ordem_id IN ('208f39d8-d72a-44a8-a48c-72bf43e4ca3d', 'cb9b5cae-b3fd-4ace-902a-5e74391ad049');