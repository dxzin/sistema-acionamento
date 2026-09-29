-- Impede que a função privilegiada de abertura/fechamento seja chamada sem login.
CREATE OR REPLACE FUNCTION public.set_daily_sheet_status(
  p_sheet_id uuid,
  p_status public.sheet_status_enum
)
RETURNS SETOF public.daily_sheets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.daily_sheets%ROWTYPE;
  v_new public.daily_sheets%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_status NOT IN ('OPEN', 'CLOSED') THEN
    RAISE EXCEPTION 'INVALID_SHEET_STATUS';
  END IF;

  SELECT daily_sheets.* INTO v_old
  FROM public.daily_sheets
  WHERE daily_sheets.id = p_sheet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DAILY_SHEET_NOT_FOUND';
  END IF;

  UPDATE public.daily_sheets
  SET status = p_status
  WHERE id = p_sheet_id
  RETURNING * INTO v_new;

  IF v_old.status IS DISTINCT FROM v_new.status THEN
    INSERT INTO public.audit_logs (user_id, entity_name, entity_id, action, old_values, new_values)
    VALUES (
      auth.uid(), 'daily_sheets', p_sheet_id, 'UPDATE',
      jsonb_build_object('status', v_old.status, 'date', v_old.date, 'region', v_old.region),
      jsonb_build_object('status', v_new.status, 'date', v_new.date, 'region', v_new.region)
    );
  END IF;

  RETURN NEXT v_new;
END;
$$;

-- Revogar PUBLIC não remove uma concessão explícita feita anteriormente a anon.
REVOKE ALL ON FUNCTION public.set_daily_sheet_status(uuid, public.sheet_status_enum) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_sheet_status(uuid, public.sheet_status_enum) TO authenticated;
