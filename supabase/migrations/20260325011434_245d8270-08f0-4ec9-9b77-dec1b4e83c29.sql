
-- Allow almoxarifado profile to update solicitacoes_almoxarifado
DROP POLICY IF EXISTS "Loja/admin/gestor can update solicitacoes" ON public.solicitacoes_almoxarifado;
CREATE POLICY "Authorized roles can update solicitacoes" ON public.solicitacoes_almoxarifado
FOR UPDATE TO authenticated
USING (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'loja'::text, 'supervisor_producao'::text, 'almoxarifado'::text]));

-- Allow almoxarifado profile to update pedidos
DROP POLICY IF EXISTS "Authorized roles can update pedidos" ON public.pedidos;
CREATE POLICY "Authorized roles can update pedidos" ON public.pedidos
FOR UPDATE TO authenticated
USING (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text, 'financeiro'::text, 'logistica'::text, 'supervisor_producao'::text, 'loja'::text, 'almoxarifado'::text]));
