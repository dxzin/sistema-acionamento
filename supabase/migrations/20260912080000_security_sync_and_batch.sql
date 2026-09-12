-- Segurança, sincronização compacta e edições em lote atômicas.

-- A política antiga FOR ALL também permitia DELETE em folhas diárias.
DROP POLICY IF EXISTS "Allow authenticated insert/update on daily_sheets" ON public.daily_sheets;

CREATE POLICY "Authenticated users can insert daily sheets"
ON public.daily_sheets FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update daily sheets"
ON public.daily_sheets FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can delete daily sheets"
ON public.daily_sheets FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
));

-- O perfil próprio não pode alterar a coluna role pelo cliente.
DROP POLICY IF EXISTS "Allow authenticated update on own profile" ON public.profiles;
REVOKE UPDATE ON public.profiles FROM authenticated;

-- Auditoria passa a ser escrita exclusivamente pelas funções operacionais.
DROP POLICY IF EXISTS "Allow authenticated insert on audit_logs" ON public.audit_logs;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- A função de fechamento continua registrando auditoria mesmo sem permitir
-- inserção direta na tabela de histórico.
ALTER FUNCTION public.set_daily_sheet_status(uuid, public.sheet_status_enum) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.set_daily_sheet_status(uuid, public.sheet_status_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_daily_sheet_status(uuid, public.sheet_status_enum) TO authenticated;

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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT dispatches.* INTO v_old
  FROM public.dispatches
  WHERE dispatches.id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DISPATCH_NOT_FOUND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_sheets
    WHERE id = v_old.daily_sheet_id AND status = 'OPEN'
  ) THEN RAISE EXCEPTION 'DAILY_SHEET_CLOSED'; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_old.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'DISPATCH_CONFLICT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb)) AS supplied(key)
    WHERE NOT (supplied.key = ANY(v_allowed_keys))
  ) THEN RAISE EXCEPTION 'INVALID_DISPATCH_FIELD'; END IF;

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

  SELECT COALESCE(jsonb_object_agg(change.key, to_jsonb(v_old)->change.key), '{}'::jsonb)
  INTO v_old_values FROM jsonb_each(COALESCE(p_changes, '{}'::jsonb)) AS change
  WHERE change.key = ANY(v_allowed_keys);
  SELECT COALESCE(jsonb_object_agg(change.key, to_jsonb(v_new)->change.key), '{}'::jsonb)
  INTO v_new_values FROM jsonb_each(COALESCE(p_changes, '{}'::jsonb)) AS change
  WHERE change.key = ANY(v_allowed_keys);

  INSERT INTO public.audit_logs (user_id, entity_name, entity_id, action, old_values, new_values)
  VALUES (auth.uid(), 'dispatches', p_dispatch_id, 'UPDATE', v_old_values, v_new_values);
  RETURN NEXT v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_dispatch_batch_with_audit(p_updates jsonb)
RETURNS SETOF public.dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_expected timestamptz;
  v_changes jsonb;
  v_row public.dispatches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF jsonb_typeof(p_updates) <> 'array' OR jsonb_array_length(p_updates) = 0 OR jsonb_array_length(p_updates) > 500 THEN
    RAISE EXCEPTION 'INVALID_BATCH_SIZE';
  END IF;

  -- Bloqueio ordenado evita deadlock entre duas colagens simultâneas.
  PERFORM 1 FROM public.dispatches
  WHERE id IN (SELECT (item->>'id')::uuid FROM jsonb_array_elements(p_updates) item)
  ORDER BY id FOR UPDATE;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates) ORDER BY value->>'id'
  LOOP
    v_id := (v_item->>'id')::uuid;
    v_expected := NULLIF(v_item->>'expected_updated_at', '')::timestamptz;
    v_changes := COALESCE(v_item->'changes', '{}'::jsonb);
    SELECT * INTO v_row FROM public.update_dispatch_with_audit(v_id, v_expected, v_changes);
    RETURN NEXT v_row;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_sheet_sync_token(p_date date, p_region text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT sheet.updated_at::text || ':' || COALESCE(MAX(dispatch.updated_at)::text, '')
  FROM public.daily_sheets sheet
  LEFT JOIN public.dispatches dispatch ON dispatch.daily_sheet_id = sheet.id
  WHERE sheet.date = p_date AND sheet.region = LEFT(UPPER(p_region), 20)
  GROUP BY sheet.id, sheet.updated_at;
$$;

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
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, email = EXCLUDED.email,
    sheet_date = EXCLUDED.sheet_date, region = EXCLUDED.region,
    active_dispatch_id = EXCLUDED.active_dispatch_id, last_seen = now();

  RETURN QUERY
  SELECT p.user_id, p.display_name, p.email, p.active_dispatch_id, p.last_seen
  FROM public.operator_presence p
  WHERE p.sheet_date = p_sheet_date
    AND p.region = LEFT(UPPER(p_region), 20)
    AND p.last_seen >= now() - interval '30 seconds'
  ORDER BY p.display_name, p.email;
END;
$$;

-- Índices duplicados pelas constraints UNIQUE.
DROP INDEX IF EXISTS public.idx_monthly_entries_lookup;
DROP INDEX IF EXISTS public.idx_daily_sheets_date;
DROP INDEX IF EXISTS public.idx_drivers_login;
DROP INDEX IF EXISTS public.idx_vehicles_plate;

REVOKE ALL ON FUNCTION public.update_dispatch_with_audit(uuid, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_dispatch_batch_with_audit(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_sheet_sync_token(date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_and_list_operator_presence(date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_dispatch_with_audit(uuid, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_dispatch_batch_with_audit(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_sheet_sync_token(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_and_list_operator_presence(date, text, uuid, text, text) TO authenticated;

-- Continuidade D-1 -> D acontece quando o dado anterior muda, não durante a leitura.
CREATE OR REPLACE FUNCTION public.propagate_dispatch_continuity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_sheet public.daily_sheets%ROWTYPE;
  v_target_sheet public.daily_sheets%ROWTYPE;
  v_awaiting_exit boolean;
BEGIN
  SELECT * INTO v_source_sheet FROM public.daily_sheets WHERE id = NEW.daily_sheet_id;
  SELECT * INTO v_target_sheet FROM public.daily_sheets
  WHERE date = v_source_sheet.date + 1 AND region = v_source_sheet.region AND status = 'OPEN';
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_awaiting_exit := UPPER(TRIM(COALESCE(NEW.dispatch_status, ''))) = 'ACIONADO' AND NEW.exit_time IS NULL;
  UPDATE public.dispatches target SET
    origin_location_id = CASE WHEN target.origin_source <> 'MANUAL' THEN NEW.final_destination_location_id ELSE target.origin_location_id END,
    origin_source = CASE WHEN target.origin_source <> 'MANUAL' THEN 'CONTINUITY' ELSE target.origin_source END,
    forecast_start_time = CASE
      WHEN target.forecast_source = 'MANUAL' THEN target.forecast_start_time
      WHEN v_awaiting_exit THEN NULL
      WHEN NEW.next_day_forecast_time IS NOT NULL THEN NEW.next_day_forecast_time
      ELSE target.forecast_start_time
    END,
    forecast_source = CASE
      WHEN target.forecast_source = 'MANUAL' THEN target.forecast_source
      WHEN v_awaiting_exit OR NEW.next_day_forecast_time IS NOT NULL THEN 'CONTINUITY'
      ELSE target.forecast_source
    END
  WHERE target.daily_sheet_id = v_target_sheet.id
    AND target.driver_id = NEW.driver_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_continuity_after_change ON public.dispatches;
CREATE TRIGGER dispatch_continuity_after_change
AFTER INSERT OR UPDATE OF dispatch_status, exit_time, final_destination_location_id, next_day_forecast_time
ON public.dispatches
FOR EACH ROW EXECUTE FUNCTION public.propagate_dispatch_continuity();
