-- Corrige a ambiguidade de user_id no UPSERT e permite reduzir pela metade
-- as gravações de presença, mantendo margem para pequenas oscilações de rede.
CREATE OR REPLACE FUNCTION public.touch_and_list_operator_presence(
  p_sheet_date date,
  p_region text,
  p_active_dispatch_id uuid,
  p_display_name text,
  p_email text
)
RETURNS TABLE (user_id uuid, display_name text, email text, active_dispatch_id uuid, last_seen timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  INSERT INTO public.operator_presence AS presence (
    user_id, display_name, email, sheet_date, region, active_dispatch_id, last_seen
  ) VALUES (
    auth.uid(), LEFT(p_display_name, 100), LEFT(p_email, 255), p_sheet_date,
    LEFT(UPPER(p_region), 20), p_active_dispatch_id, now()
  )
  ON CONFLICT ON CONSTRAINT operator_presence_pkey DO UPDATE SET
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    sheet_date = EXCLUDED.sheet_date,
    region = EXCLUDED.region,
    active_dispatch_id = EXCLUDED.active_dispatch_id,
    last_seen = now();

  RETURN QUERY
  SELECT p.user_id, p.display_name, p.email, p.active_dispatch_id, p.last_seen
  FROM public.operator_presence p
  WHERE p.sheet_date = p_sheet_date
    AND p.region = LEFT(UPPER(p_region), 20)
    AND p.last_seen >= now() - interval '150 seconds'
  ORDER BY p.display_name, p.email;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_and_list_operator_presence(date, text, uuid, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_and_list_operator_presence(date, text, uuid, text, text)
TO authenticated;
