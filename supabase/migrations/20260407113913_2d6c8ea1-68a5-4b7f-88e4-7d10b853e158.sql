-- ============================================================
-- 1. SEQUENCE para número de pedido (elimina race condition)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS pedido_numero_seq START 1;

-- Sincronizar a sequence com o maior número já existente
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT COALESCE(
    MAX(CAST(REGEXP_REPLACE(numero_pedido, '[^0-9]', '', 'g') AS integer)),
    0
  ) INTO max_num
  FROM pedidos
  WHERE numero_pedido ~ '^PED-[0-9]+$';

  IF max_num > 0 THEN
    PERFORM setval('pedido_numero_seq', max_num);
  END IF;
END $$;

-- Função para gerar número de pedido de forma segura e atômica
CREATE OR REPLACE FUNCTION next_numero_pedido()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'PED-' || LPAD(nextval('pedido_numero_seq')::text, 5, '0');
$$;

-- ============================================================
-- 2. REALTIME — habilitar nas tabelas principais
-- ============================================================
ALTER TABLE public.pedidos REPLICA IDENTITY FULL;
ALTER TABLE public.ordens_producao REPLICA IDENTITY FULL;
ALTER TABLE public.op_etapas REPLICA IDENTITY FULL;
ALTER TABLE public.pedido_itens REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pedidos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'ordens_producao'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens_producao;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'op_etapas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.op_etapas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pedido_itens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_itens;
  END IF;
END $$;