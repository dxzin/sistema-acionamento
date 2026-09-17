-- Após abono em D-1, D usa o turno da escala menos quatro horas.
-- Aplica também em folhas já criadas e em correções posteriores de D-1.
CREATE OR REPLACE FUNCTION public.apply_previous_abono()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sheet public.daily_sheets%ROWTYPE;
  v_previous_status text;
  v_shift time;
  v_closed boolean;
BEGIN
  SELECT * INTO v_sheet FROM public.daily_sheets WHERE id = NEW.daily_sheet_id;
  IF v_sheet.status <> 'OPEN' THEN RETURN NEW; END IF;
  SELECT UPPER(TRIM(previous.dispatch_status)) INTO v_previous_status
  FROM public.dispatches previous JOIN public.daily_sheets sheet ON sheet.id = previous.daily_sheet_id
  WHERE sheet.date = v_sheet.date - 1 AND sheet.region = v_sheet.region AND previous.driver_id = NEW.driver_id;
  IF v_previous_status IS DISTINCT FROM 'ABONADO' THEN RETURN NEW; END IF;

  SELECT COALESCE(entry.shift_time, driver.default_start_time),
    UPPER(TRIM(COALESCE(entry.shift_letter, ''))) = 'VF'
  INTO v_shift, v_closed
  FROM public.drivers driver
  LEFT JOIN public.monthly_schedules schedule ON schedule.year = EXTRACT(YEAR FROM v_sheet.date)
    AND schedule.month = EXTRACT(MONTH FROM v_sheet.date)
    AND (schedule.region = v_sheet.region OR (schedule.region = 'MG' AND v_sheet.region = 'UBJP'))
  LEFT JOIN public.monthly_schedule_entries entry ON entry.schedule_id = schedule.id
    AND entry.driver_id = driver.id AND entry.day_of_month = EXTRACT(DAY FROM v_sheet.date)
  WHERE driver.id = NEW.driver_id ORDER BY entry.id NULLS LAST LIMIT 1;

  IF COALESCE(NEW.forecast_source, 'SCHEDULE') <> 'MANUAL' THEN
    NEW.forecast_start_time := CASE WHEN v_closed THEN NULL ELSE (v_shift - interval '4 hours')::time END;
    NEW.forecast_source := 'SCHEDULE';
  END IF;
  IF NULLIF(TRIM(NEW.abono_reason), '') IS NULL THEN NEW.abono_reason := 'Abonado ontem'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_previous_abono_before_change
BEFORE INSERT OR UPDATE OF forecast_start_time, forecast_source, abono_reason, scale_day_status
ON public.dispatches FOR EACH ROW EXECUTE FUNCTION public.apply_previous_abono();
REVOKE ALL ON FUNCTION public.apply_previous_abono() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.propagate_dispatch_continuity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source_sheet public.daily_sheets%ROWTYPE;
  v_target_sheet public.daily_sheets%ROWTYPE;
  v_awaiting_exit boolean;
  v_abonado boolean;
  v_was_abonado boolean;
  v_shift time;
  v_code text;
  v_closed boolean;
BEGIN
  SELECT * INTO v_source_sheet FROM public.daily_sheets WHERE id = NEW.daily_sheet_id;
  SELECT * INTO v_target_sheet FROM public.daily_sheets
  WHERE date = v_source_sheet.date + 1 AND region = v_source_sheet.region AND status = 'OPEN';
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_abonado := UPPER(TRIM(COALESCE(NEW.dispatch_status, ''))) = 'ABONADO';
  v_was_abonado := CASE WHEN TG_OP = 'UPDATE' THEN UPPER(TRIM(COALESCE(OLD.dispatch_status, ''))) = 'ABONADO' ELSE false END;
  v_awaiting_exit := UPPER(TRIM(COALESCE(NEW.dispatch_status, ''))) = 'ACIONADO' AND NEW.exit_time IS NULL;

  SELECT COALESCE(entry.shift_time, driver.default_start_time), entry.scale_code,
    UPPER(TRIM(COALESCE(entry.shift_letter, ''))) = 'VF'
  INTO v_shift, v_code, v_closed
  FROM public.drivers driver
  LEFT JOIN public.monthly_schedules schedule ON schedule.year = EXTRACT(YEAR FROM v_target_sheet.date)
    AND schedule.month = EXTRACT(MONTH FROM v_target_sheet.date)
    AND (schedule.region = v_target_sheet.region OR (schedule.region = 'MG' AND v_target_sheet.region = 'UBJP'))
  LEFT JOIN public.monthly_schedule_entries entry ON entry.schedule_id = schedule.id
    AND entry.driver_id = driver.id AND entry.day_of_month = EXTRACT(DAY FROM v_target_sheet.date)
  WHERE driver.id = NEW.driver_id ORDER BY entry.id NULLS LAST LIMIT 1;

  UPDATE public.dispatches target SET
    origin_location_id = CASE WHEN target.origin_source <> 'MANUAL' THEN NEW.final_destination_location_id ELSE target.origin_location_id END,
    origin_source = CASE WHEN target.origin_source <> 'MANUAL' THEN 'CONTINUITY' ELSE target.origin_source END,
    forecast_start_time = CASE
      WHEN target.forecast_source = 'MANUAL' THEN target.forecast_start_time
      WHEN v_abonado THEN CASE WHEN v_closed THEN NULL ELSE (v_shift - interval '4 hours')::time END
      WHEN v_awaiting_exit THEN NULL
      WHEN NEW.next_day_forecast_time IS NOT NULL THEN NEW.next_day_forecast_time
      WHEN v_was_abonado THEN CASE WHEN v_closed THEN NULL WHEN TRIM(v_code) = '1' THEN (v_shift - interval '4 hours')::time ELSE v_shift END
      ELSE target.forecast_start_time END,
    forecast_source = CASE
      WHEN target.forecast_source = 'MANUAL' THEN target.forecast_source
      WHEN v_abonado THEN 'SCHEDULE'
      WHEN v_awaiting_exit OR NEW.next_day_forecast_time IS NOT NULL THEN 'CONTINUITY'
      WHEN v_was_abonado THEN 'SCHEDULE' ELSE target.forecast_source END,
    abono_reason = CASE
      WHEN v_abonado AND NULLIF(TRIM(target.abono_reason), '') IS NULL THEN 'Abonado ontem'
      WHEN NOT v_abonado AND v_was_abonado AND target.abono_reason = 'Abonado ontem' THEN NULL
      ELSE target.abono_reason END
  WHERE target.daily_sheet_id = v_target_sheet.id AND target.driver_id = NEW.driver_id;
  RETURN NEW;
END;
$$;

-- Recalcula somente valores automáticos e preenche motivos vazios em folhas abertas.
UPDATE public.dispatches target SET forecast_start_time = target.forecast_start_time
FROM public.daily_sheets current_sheet, public.daily_sheets previous_sheet, public.dispatches previous
WHERE current_sheet.id = target.daily_sheet_id AND current_sheet.status = 'OPEN'
  AND previous_sheet.date = current_sheet.date - 1 AND previous_sheet.region = current_sheet.region
  AND previous.daily_sheet_id = previous_sheet.id AND previous.driver_id = target.driver_id
  AND UPPER(TRIM(previous.dispatch_status)) = 'ABONADO';
