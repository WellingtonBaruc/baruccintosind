
-- Allow supervisor_producao to insert pedidos (for PCP-generated independent OPs)
DROP POLICY IF EXISTS "Admin/gestor/comercial can insert pedidos" ON public.pedidos;
CREATE POLICY "Admin/gestor/comercial/supervisor can insert pedidos"
ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text, 'supervisor_producao'::text]));

-- Allow supervisor_producao to insert pedido_itens
DROP POLICY IF EXISTS "Admin/gestor/comercial can insert pedido_itens" ON public.pedido_itens;
CREATE POLICY "Admin/gestor/comercial/supervisor can insert pedido_itens"
ON public.pedido_itens FOR INSERT TO authenticated
WITH CHECK (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text, 'supervisor_producao'::text]));

-- Allow supervisor_producao to insert ordens_producao
DROP POLICY IF EXISTS "Admin/gestor/comercial can insert ordens" ON public.ordens_producao;
CREATE POLICY "Admin/gestor/comercial/supervisor can insert ordens"
ON public.ordens_producao FOR INSERT TO authenticated
WITH CHECK (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text, 'supervisor_producao'::text]));
