
CREATE TABLE public.vendedoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  whatsapp text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendedoras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read vendedoras" ON public.vendedoras
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage vendedoras" ON public.vendedoras
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
