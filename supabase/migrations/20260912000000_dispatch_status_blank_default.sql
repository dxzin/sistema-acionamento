-- O status diário é uma decisão exclusiva da operação.
-- Inserções que não informarem o campo devem permanecer em branco.
ALTER TABLE public.dispatches
  ALTER COLUMN dispatch_status SET DEFAULT '';
