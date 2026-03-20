
-- Tighten UPDATE policies to restrict by role instead of USING (true)

-- pedidos: only admin, gestor, comercial, financeiro, logistica can update
DROP POLICY "Auth users can update pedidos" ON public.pedidos;
CREATE POLICY "Authorized roles can update pedidos" ON public.pedidos FOR UPDATE TO authenticated
  USING (public.get_user_perfil() IN ('admin', 'gestor', 'comercial', 'financeiro', 'logistica', 'supervisor_producao'));

-- ordens_producao: production roles + admin/gestor
DROP POLICY "Auth users can update ordens" ON public.ordens_producao;
CREATE POLICY "Production roles can update ordens" ON public.ordens_producao FOR UPDATE TO authenticated
  USING (public.get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao', 'operador_producao'));

-- op_etapas: production roles + admin/gestor
DROP POLICY "Auth users can update op_etapas" ON public.op_etapas;
CREATE POLICY "Production roles can update op_etapas" ON public.op_etapas FOR UPDATE TO authenticated
  USING (public.get_user_perfil() IN ('admin', 'gestor', 'supervisor_producao', 'operador_producao'));

-- pedido_historico insert: restrict to authenticated (already is, but make explicit with role check)
DROP POLICY "Auth users can insert historico" ON public.pedido_historico;
CREATE POLICY "Authenticated users insert historico" ON public.pedido_historico FOR INSERT TO authenticated
  WITH CHECK (public.get_user_perfil() IS NOT NULL);
