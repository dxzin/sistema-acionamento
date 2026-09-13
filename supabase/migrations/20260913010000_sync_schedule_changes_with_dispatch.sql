-- Alterações na escala precisam acordar as telas de acionamento conectadas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'monthly_schedule_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_schedule_entries;
  END IF;
END;
$$;

-- Inclui a escala no token usado quando a rede bloqueia o WebSocket.
CREATE OR REPLACE FUNCTION public.get_daily_sheet_sync_token(p_date date, p_region text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT sheet.updated_at::text
    || ':' || COALESCE((
      SELECT MAX(dispatch.updated_at)::text
      FROM public.dispatches dispatch
      WHERE dispatch.daily_sheet_id = sheet.id
    ), '')
    || ':' || COALESCE((
      SELECT MAX(entry.updated_at)::text
      FROM public.monthly_schedules schedule
      JOIN public.monthly_schedule_entries entry ON entry.schedule_id = schedule.id
      WHERE schedule.year = EXTRACT(YEAR FROM p_date)::integer
        AND schedule.month = EXTRACT(MONTH FROM p_date)::integer
        AND schedule.region = CASE WHEN UPPER(p_region) = 'UBJP' THEN 'MG' ELSE LEFT(UPPER(p_region), 20) END
        AND entry.day_of_month = EXTRACT(DAY FROM p_date)::integer
    ), '')
  FROM public.daily_sheets sheet
  WHERE sheet.date = p_date
    AND sheet.region = LEFT(UPPER(p_region), 20);
$$;

REVOKE ALL ON FUNCTION public.get_daily_sheet_sync_token(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_sheet_sync_token(date, text) TO authenticated;
