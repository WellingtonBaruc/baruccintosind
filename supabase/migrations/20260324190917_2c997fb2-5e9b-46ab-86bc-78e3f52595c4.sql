
ALTER TABLE public.usuarios
  ADD COLUMN kanban_producao_acesso boolean NOT NULL DEFAULT true,
  ADD COLUMN kanban_venda_acesso boolean NOT NULL DEFAULT true;
