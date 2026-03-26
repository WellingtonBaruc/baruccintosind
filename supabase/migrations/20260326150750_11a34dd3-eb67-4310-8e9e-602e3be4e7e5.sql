
-- Update INSERT policies to include 'comercial' profile

-- pedidos
DROP POLICY "Admin/gestor can insert pedidos" ON pedidos;
CREATE POLICY "Admin/gestor/comercial can insert pedidos" ON pedidos
FOR INSERT TO authenticated
WITH CHECK (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text]));

-- pedido_itens
DROP POLICY "Admin/gestor can insert pedido_itens" ON pedido_itens;
CREATE POLICY "Admin/gestor/comercial can insert pedido_itens" ON pedido_itens
FOR INSERT TO authenticated
WITH CHECK (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text]));

-- ordens_producao
DROP POLICY "Admin/gestor can insert ordens" ON ordens_producao;
CREATE POLICY "Admin/gestor/comercial can insert ordens" ON ordens_producao
FOR INSERT TO authenticated
WITH CHECK (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text]));

-- op_etapas
DROP POLICY "Admin/gestor can insert op_etapas" ON op_etapas;
CREATE POLICY "Admin/gestor/comercial can insert op_etapas" ON op_etapas
FOR INSERT TO authenticated
WITH CHECK (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text]));
