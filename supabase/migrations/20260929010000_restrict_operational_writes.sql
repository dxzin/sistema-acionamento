-- Centraliza todas as gravações operacionais em funções transacionais.
-- A auditoria por trigger cobre inclusive alterações internas de sincronização.

CREATE OR REPLACE FUNCTION public.audit_operational_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_values jsonb;
  v_new_values jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, entity_name, entity_id, action, old_values, new_values)
    VALUES (auth.uid(), TG_TABLE_NAME, NEW.id, 'CREATE', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(jsonb_object_agg(old_item.key, old_item.value), '{}'::jsonb)
    INTO v_old_values
    FROM jsonb_each(to_jsonb(OLD)) AS old_item
    WHERE old_item.key NOT IN ('updated_at', 'created_at')
      AND old_item.value IS DISTINCT FROM to_jsonb(NEW)->old_item.key;

    SELECT COALESCE(jsonb_object_agg(new_item.key, new_item.value), '{}'::jsonb)
    INTO v_new_values
    FROM jsonb_each(to_jsonb(NEW)) AS new_item
    WHERE new_item.key NOT IN ('updated_at', 'created_at')
      AND new_item.value IS DISTINCT FROM to_jsonb(OLD)->new_item.key;

    IF v_new_values <> '{}'::jsonb THEN
      INSERT INTO public.audit_logs (user_id, entity_name, entity_id, action, old_values, new_values)
      VALUES (auth.uid(), TG_TABLE_NAME, NEW.id, 'UPDATE', v_old_values, v_new_values);
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_logs (user_id, entity_name, entity_id, action, old_values, new_values)
    VALUES (auth.uid(), TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_daily_sheets_row_change ON public.daily_sheets;
CREATE TRIGGER audit_daily_sheets_row_change
AFTER INSERT OR UPDATE OR DELETE ON public.daily_sheets
FOR EACH ROW EXECUTE FUNCTION public.audit_operational_row_change();

DROP TRIGGER IF EXISTS audit_dispatches_row_change ON public.dispatches;
CREATE TRIGGER audit_dispatches_row_change
AFTER INSERT OR UPDATE OR DELETE ON public.dispatches
FOR EACH ROW EXECUTE FUNCTION public.audit_operational_row_change();

-- A criação inicial da folha e das linhas ocorre na mesma transação.
CREATE OR REPLACE FUNCTION public.ensure_daily_sheet_with_dispatches(
  p_date date,
  p_region text,
  p_dispatches jsonb
)
RETURNS SETOF public.dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sheet public.daily_sheets%ROWTYPE;
  v_item jsonb;
  v_inserted public.dispatches%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_region text := LEFT(UPPER(TRIM(COALESCE(p_region, ''))), 20);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_date IS NULL OR p_date NOT IN (v_today, v_today + 1) THEN
    RAISE EXCEPTION 'DAILY_SHEET_DATE_NOT_ALLOWED';
  END IF;
  IF v_region = '' THEN RAISE EXCEPTION 'INVALID_DAILY_SHEET_REGION'; END IF;
  IF jsonb_typeof(p_dispatches) <> 'array'
    OR jsonb_array_length(p_dispatches) = 0
    OR jsonb_array_length(p_dispatches) > 500 THEN
    RAISE EXCEPTION 'INVALID_BATCH_SIZE';
  END IF;

  INSERT INTO public.daily_sheets (date, region, status, created_by)
  VALUES (p_date, v_region, 'OPEN', auth.uid())
  ON CONFLICT (date, region) DO NOTHING;

  SELECT * INTO v_sheet
  FROM public.daily_sheets
  WHERE date = p_date AND region = v_region
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_SHEET_NOT_FOUND'; END IF;
  IF v_sheet.status <> 'OPEN' THEN RAISE EXCEPTION 'DAILY_SHEET_CLOSED'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_dispatches)
  LOOP
    IF NULLIF(v_item->>'driver_id', '') IS NULL THEN
      RAISE EXCEPTION 'DRIVER_ID_REQUIRED';
    END IF;

    INSERT INTO public.dispatches (
      daily_sheet_id, driver_id, previous_dispatch_id,
      forecast_start_time, forecast_source, dispatch_status,
      abono_reason, abono_authorized_by, origin_location_id, origin_source,
      entry_time, vehicle_id, cargo_status, destination_location_id,
      final_destination_location_id, exit_time, observations,
      scale_day_status, next_day_forecast_time, total_worked_minutes
    ) VALUES (
      v_sheet.id,
      (v_item->>'driver_id')::uuid,
      NULLIF(v_item->>'previous_dispatch_id', '')::uuid,
      NULLIF(v_item->>'forecast_start_time', '')::time,
      COALESCE(NULLIF(v_item->>'forecast_source', ''), 'SCHEDULE'),
      COALESCE(v_item->>'dispatch_status', ''),
      v_item->>'abono_reason',
      v_item->>'abono_authorized_by',
      NULLIF(v_item->>'origin_location_id', '')::uuid,
      COALESCE(NULLIF(v_item->>'origin_source', ''), 'SCHEDULE'),
      NULLIF(v_item->>'entry_time', ''),
      NULLIF(v_item->>'vehicle_id', '')::uuid,
      v_item->>'cargo_status',
      NULLIF(v_item->>'destination_location_id', '')::uuid,
      NULLIF(v_item->>'final_destination_location_id', '')::uuid,
      NULLIF(v_item->>'exit_time', '')::time,
      v_item->>'observations',
      v_item->>'scale_day_status',
      NULLIF(v_item->>'next_day_forecast_time', '')::time,
      NULLIF(v_item->>'total_worked_minutes', '')::integer
    )
    ON CONFLICT (daily_sheet_id, driver_id) DO NOTHING
    RETURNING * INTO v_inserted;

    IF NOT FOUND THEN
      SELECT * INTO v_inserted
      FROM public.dispatches
      WHERE daily_sheet_id = v_sheet.id
        AND driver_id = (v_item->>'driver_id')::uuid;
    END IF;
    IF FOUND THEN RETURN NEXT v_inserted; END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_dispatch_with_audit(p_dispatch jsonb)
RETURNS SETOF public.dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sheet_id uuid := NULLIF(p_dispatch->>'daily_sheet_id', '')::uuid;
  v_new public.dispatches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_sheet_id IS NULL OR NULLIF(p_dispatch->>'driver_id', '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_DISPATCH';
  END IF;

  PERFORM 1 FROM public.daily_sheets
  WHERE id = v_sheet_id AND status = 'OPEN'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_SHEET_CLOSED'; END IF;

  INSERT INTO public.dispatches (
    daily_sheet_id, driver_id, previous_dispatch_id,
    forecast_start_time, forecast_source, dispatch_status,
    abono_reason, abono_authorized_by, origin_location_id, origin_source,
    entry_time, vehicle_id, cargo_status, destination_location_id,
    final_destination_location_id, exit_time, observations,
    scale_day_status, next_day_forecast_time, total_worked_minutes
  ) VALUES (
    v_sheet_id,
    (p_dispatch->>'driver_id')::uuid,
    NULLIF(p_dispatch->>'previous_dispatch_id', '')::uuid,
    NULLIF(p_dispatch->>'forecast_start_time', '')::time,
    COALESCE(NULLIF(p_dispatch->>'forecast_source', ''), 'SCHEDULE'),
    COALESCE(p_dispatch->>'dispatch_status', ''),
    p_dispatch->>'abono_reason',
    p_dispatch->>'abono_authorized_by',
    NULLIF(p_dispatch->>'origin_location_id', '')::uuid,
    COALESCE(NULLIF(p_dispatch->>'origin_source', ''), 'SCHEDULE'),
    NULLIF(p_dispatch->>'entry_time', ''),
    NULLIF(p_dispatch->>'vehicle_id', '')::uuid,
    p_dispatch->>'cargo_status',
    NULLIF(p_dispatch->>'destination_location_id', '')::uuid,
    NULLIF(p_dispatch->>'final_destination_location_id', '')::uuid,
    NULLIF(p_dispatch->>'exit_time', '')::time,
    p_dispatch->>'observations',
    p_dispatch->>'scale_day_status',
    NULLIF(p_dispatch->>'next_day_forecast_time', '')::time,
    NULLIF(p_dispatch->>'total_worked_minutes', '')::integer
  )
  RETURNING * INTO v_new;

  RETURN NEXT v_new;
END;
$$;

-- A auditoria agora é gerada pelo trigger, dentro da mesma transação da edição.
CREATE OR REPLACE FUNCTION public.update_dispatch_with_audit(
  p_dispatch_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb
)
RETURNS SETOF public.dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.dispatches%ROWTYPE;
  v_new public.dispatches%ROWTYPE;
  v_allowed_keys text[] := ARRAY[
    'forecast_start_time', 'forecast_source', 'dispatch_status', 'abono_reason',
    'abono_authorized_by', 'origin_location_id', 'origin_source', 'entry_time',
    'vehicle_id', 'cargo_status', 'destination_location_id',
    'final_destination_location_id', 'exit_time', 'observations',
    'next_day_forecast_time', 'total_worked_minutes'
  ];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT dispatches.* INTO v_old
  FROM public.dispatches
  WHERE dispatches.id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_FOUND'; END IF;

  PERFORM 1 FROM public.daily_sheets
  WHERE id = v_old.daily_sheet_id AND status = 'OPEN'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_SHEET_CLOSED'; END IF;

  IF p_expected_updated_at IS NOT NULL AND v_old.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'DISPATCH_CONFLICT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb)) AS supplied(key)
    WHERE NOT (supplied.key = ANY(v_allowed_keys))
  ) THEN RAISE EXCEPTION 'INVALID_DISPATCH_FIELD'; END IF;
  IF COALESCE(p_changes, '{}'::jsonb) = '{}'::jsonb THEN
    RETURN NEXT v_old;
    RETURN;
  END IF;

  UPDATE public.dispatches SET
    forecast_start_time = CASE WHEN p_changes ? 'forecast_start_time' THEN NULLIF(p_changes->>'forecast_start_time', '')::time ELSE forecast_start_time END,
    forecast_source = CASE WHEN p_changes ? 'forecast_source' THEN p_changes->>'forecast_source' ELSE forecast_source END,
    dispatch_status = CASE WHEN p_changes ? 'dispatch_status' THEN COALESCE(p_changes->>'dispatch_status', '') ELSE dispatch_status END,
    abono_reason = CASE WHEN p_changes ? 'abono_reason' THEN p_changes->>'abono_reason' ELSE abono_reason END,
    abono_authorized_by = CASE WHEN p_changes ? 'abono_authorized_by' THEN p_changes->>'abono_authorized_by' ELSE abono_authorized_by END,
    origin_location_id = CASE WHEN p_changes ? 'origin_location_id' THEN NULLIF(p_changes->>'origin_location_id', '')::uuid ELSE origin_location_id END,
    origin_source = CASE WHEN p_changes ? 'origin_source' THEN p_changes->>'origin_source' ELSE origin_source END,
    entry_time = CASE WHEN p_changes ? 'entry_time' THEN NULLIF(p_changes->>'entry_time', '') ELSE entry_time END,
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

  RETURN NEXT v_new;
END;
$$;

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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_status NOT IN ('OPEN', 'CLOSED') THEN RAISE EXCEPTION 'INVALID_SHEET_STATUS'; END IF;

  SELECT daily_sheets.* INTO v_old
  FROM public.daily_sheets
  WHERE daily_sheets.id = p_sheet_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_SHEET_NOT_FOUND'; END IF;
  IF v_old.status IS NOT DISTINCT FROM p_status THEN
    RETURN NEXT v_old;
    RETURN;
  END IF;

  UPDATE public.daily_sheets
  SET status = p_status
  WHERE id = p_sheet_id
  RETURNING * INTO v_new;

  RETURN NEXT v_new;
END;
$$;

-- Remove a rota direta pelo cliente. Funções SECURITY DEFINER e triggers internos
-- continuam operando, mas toda ação do usuário passa pelas funções acima.
DROP POLICY IF EXISTS "Authenticated users can insert daily sheets" ON public.daily_sheets;
DROP POLICY IF EXISTS "Authenticated users can update daily sheets" ON public.daily_sheets;
DROP POLICY IF EXISTS "Only admins can delete daily sheets" ON public.daily_sheets;
DROP POLICY IF EXISTS "Allow authenticated insert on open dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "Allow authenticated update on open dispatches" ON public.dispatches;
DROP POLICY IF EXISTS "Allow authenticated delete on open dispatches" ON public.dispatches;

REVOKE INSERT, UPDATE, DELETE ON public.daily_sheets FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.dispatches FROM authenticated, anon;

REVOKE ALL ON FUNCTION public.audit_operational_row_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_daily_sheet_with_dispatches(date, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_dispatch_with_audit(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_dispatch_with_audit(uuid, timestamptz, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_dispatch_batch_with_audit(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_daily_sheet_status(uuid, public.sheet_status_enum) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_daily_sheet_with_dispatches(date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_dispatch_with_audit(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_dispatch_with_audit(uuid, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_dispatch_batch_with_audit(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_daily_sheet_status(uuid, public.sheet_status_enum) TO authenticated;
