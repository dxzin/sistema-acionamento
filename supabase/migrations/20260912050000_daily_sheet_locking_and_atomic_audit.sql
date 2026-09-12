-- Fechamento operacional, bloqueio de escrita e atualização concorrente segura.

DROP POLICY IF EXISTS "Allow authenticated insert/update on dispatches" ON public.dispatches;

CREATE POLICY "Allow authenticated insert on open dispatches"
ON public.dispatches FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.daily_sheets
  WHERE daily_sheets.id = dispatches.daily_sheet_id
    AND daily_sheets.status = 'OPEN'
));

CREATE POLICY "Allow authenticated update on open dispatches"
ON public.dispatches FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.daily_sheets
  WHERE daily_sheets.id = dispatches.daily_sheet_id
    AND daily_sheets.status = 'OPEN'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.daily_sheets
  WHERE daily_sheets.id = dispatches.daily_sheet_id
    AND daily_sheets.status = 'OPEN'
));

CREATE POLICY "Allow authenticated delete on open dispatches"
ON public.dispatches FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.daily_sheets
  WHERE daily_sheets.id = dispatches.daily_sheet_id
    AND daily_sheets.status = 'OPEN'
));

CREATE OR REPLACE FUNCTION public.update_dispatch_with_audit(
  p_dispatch_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb
)
RETURNS SETOF public.dispatches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old public.dispatches%ROWTYPE;
  v_new public.dispatches%ROWTYPE;
  v_old_values jsonb;
  v_new_values jsonb;
  v_allowed_keys text[] := ARRAY[
    'forecast_start_time', 'forecast_source', 'dispatch_status', 'abono_reason',
    'abono_authorized_by', 'origin_location_id', 'origin_source', 'entry_time',
    'vehicle_id', 'cargo_status', 'destination_location_id',
    'final_destination_location_id', 'exit_time', 'observations',
    'next_day_forecast_time', 'total_worked_minutes'
  ];
BEGIN
  SELECT dispatches.* INTO v_old
  FROM public.dispatches
  WHERE dispatches.id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISPATCH_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.daily_sheets
    WHERE id = v_old.daily_sheet_id AND status = 'OPEN'
  ) THEN
    RAISE EXCEPTION 'DAILY_SHEET_CLOSED';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_old.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'DISPATCH_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb)) AS supplied(key)
    WHERE NOT (supplied.key = ANY(v_allowed_keys))
  ) THEN
    RAISE EXCEPTION 'INVALID_DISPATCH_FIELD';
  END IF;

  UPDATE public.dispatches SET
    forecast_start_time = CASE WHEN p_changes ? 'forecast_start_time' THEN NULLIF(p_changes->>'forecast_start_time', '')::time ELSE forecast_start_time END,
    forecast_source = CASE WHEN p_changes ? 'forecast_source' THEN p_changes->>'forecast_source' ELSE forecast_source END,
    dispatch_status = CASE WHEN p_changes ? 'dispatch_status' THEN COALESCE(p_changes->>'dispatch_status', '') ELSE dispatch_status END,
    abono_reason = CASE WHEN p_changes ? 'abono_reason' THEN p_changes->>'abono_reason' ELSE abono_reason END,
    abono_authorized_by = CASE WHEN p_changes ? 'abono_authorized_by' THEN p_changes->>'abono_authorized_by' ELSE abono_authorized_by END,
    origin_location_id = CASE WHEN p_changes ? 'origin_location_id' THEN NULLIF(p_changes->>'origin_location_id', '')::uuid ELSE origin_location_id END,
    origin_source = CASE WHEN p_changes ? 'origin_source' THEN p_changes->>'origin_source' ELSE origin_source END,
    entry_time = CASE WHEN p_changes ? 'entry_time' THEN NULLIF(p_changes->>'entry_time', '')::time ELSE entry_time END,
    vehicle_id = CASE WHEN p_changes ? 'vehicle_id' THEN NULLIF(p_changes->>'vehicle_id', '')::uuid ELSE vehicle_id END,
    cargo_status = CASE WHEN p_changes ? 'cargo_status' THEN p_changes->>'cargo_status' ELSE cargo_status END,
    destination_location_id = CASE WHEN p_changes ? 'destination_location_id' THEN NULLIF(p_changes->>'destination_location_id', '')::uuid ELSE destination_location_id END,
    final_destination_location_id = CASE WHEN p_changes ? 'final_destination_location_id' THEN NULLIF(p_changes->>'final_destination_location_id', '')::uuid ELSE final_destination_location_id END,
    exit_time = CASE WHEN p_changes ? 'exit_time' THEN NULLIF(p_changes->>'exit_time', '')::time ELSE exit_time END,
    observations = CASE WHEN p_changes ? 'observations' THEN p_changes->>'observations' ELSE observations END,
    next_day_forecast_time = CASE WHEN p_changes ? 'next_day_forecast_time' THEN NULLIF(p_changes->>'next_day_forecast_time', '')::time ELSE next_day_forecast_time END,
    total_worked_minutes = CASE WHEN p_changes ? 'total_worked_minutes' THEN (p_changes->>'total_worked_minutes')::integer ELSE total_worked_minutes END
  WHERE id = p_dispatch_id
  RETURNING * INTO v_new;

  SELECT COALESCE(jsonb_object_agg(changes.key, to_jsonb(v_old)->changes.key), '{}'::jsonb)
  INTO v_old_values
  FROM jsonb_each(COALESCE(p_changes, '{}'::jsonb)) AS changes
  WHERE changes.key = ANY(v_allowed_keys);

  SELECT COALESCE(jsonb_object_agg(changes.key, to_jsonb(v_new)->changes.key), '{}'::jsonb)
  INTO v_new_values
  FROM jsonb_each(COALESCE(p_changes, '{}'::jsonb)) AS changes
  WHERE changes.key = ANY(v_allowed_keys);

  INSERT INTO public.audit_logs (user_id, entity_name, entity_id, action, old_values, new_values)
  VALUES (auth.uid(), 'dispatches', p_dispatch_id, 'UPDATE', v_old_values, v_new_values);

  RETURN NEXT v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_daily_sheet_status(
  p_sheet_id uuid,
  p_status public.sheet_status_enum
)
RETURNS SETOF public.daily_sheets
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old public.daily_sheets%ROWTYPE;
  v_new public.daily_sheets%ROWTYPE;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.update_dispatch_with_audit(uuid, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_daily_sheet_status(uuid, public.sheet_status_enum) TO authenticated;
