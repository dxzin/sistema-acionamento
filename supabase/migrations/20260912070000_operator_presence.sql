-- Presença colaborativa resistente a redes que bloqueiam WebSocket.
CREATE TABLE IF NOT EXISTS public.operator_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email text NOT NULL,
  sheet_date date NOT NULL,
  region varchar(20) NOT NULL,
  active_dispatch_id uuid REFERENCES public.dispatches(id) ON DELETE SET NULL,
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_presence_sheet
  ON public.operator_presence(sheet_date, region, last_seen DESC);

ALTER TABLE public.operator_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read operator presence"
ON public.operator_presence FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own operator presence"
ON public.operator_presence FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own operator presence"
ON public.operator_presence FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own operator presence"
ON public.operator_presence FOR DELETE TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_presence TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_operator_presence(
  p_sheet_date date,
  p_region text,
  p_active_dispatch_id uuid,
  p_display_name text,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  INSERT INTO public.operator_presence (
    user_id, display_name, email, sheet_date, region, active_dispatch_id, last_seen
  ) VALUES (
    auth.uid(), LEFT(p_display_name, 100), LEFT(p_email, 255), p_sheet_date,
    LEFT(UPPER(p_region), 20), p_active_dispatch_id, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    sheet_date = EXCLUDED.sheet_date,
    region = EXCLUDED.region,
    active_dispatch_id = EXCLUDED.active_dispatch_id,
    last_seen = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_operator_presence(
  p_sheet_date date,
  p_region text
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  active_dispatch_id uuid,
  last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT presence.user_id, presence.display_name, presence.email,
         presence.active_dispatch_id, presence.last_seen
  FROM public.operator_presence AS presence
  WHERE presence.sheet_date = p_sheet_date
    AND presence.region = LEFT(UPPER(p_region), 20)
    AND presence.last_seen >= now() - interval '20 seconds'
  ORDER BY presence.display_name, presence.email;
$$;

GRANT EXECUTE ON FUNCTION public.touch_operator_presence(date, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_operator_presence(date, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'operator_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operator_presence;
  END IF;
END;
$$;
