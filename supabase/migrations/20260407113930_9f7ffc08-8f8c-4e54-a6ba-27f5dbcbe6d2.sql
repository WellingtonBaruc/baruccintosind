CREATE OR REPLACE FUNCTION next_numero_pedido()
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT 'PED-' || LPAD(nextval('pedido_numero_seq')::text, 5, '0');
$$;