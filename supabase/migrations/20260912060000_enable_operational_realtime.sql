-- Publica as alterações operacionais para que outros computadores atualizem
-- a grade e o estado da folha sem precisar apertar o botão Atualizar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dispatches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatches;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'daily_sheets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_sheets;
  END IF;
END;
$$;
