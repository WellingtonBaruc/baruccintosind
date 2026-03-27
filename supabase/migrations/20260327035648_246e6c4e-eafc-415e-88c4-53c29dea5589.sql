-- Allow supervisor_producao to delete pedido_itens (needed for OP PCP edit)
DROP POLICY IF EXISTS "Admin can delete pedido_itens" ON public.pedido_itens;
CREATE POLICY "Admin/supervisor can delete pedido_itens"
  ON public.pedido_itens
  FOR DELETE
  TO authenticated
  USING (get_user_perfil() = ANY (ARRAY['admin'::text, 'gestor'::text, 'supervisor_producao'::text]));