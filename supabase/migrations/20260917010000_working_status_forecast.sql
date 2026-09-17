-- Unifica previsões automáticas em folhas abertas. Mantém edições manuais.
CREATE OR REPLACE FUNCTION public.apply_previous_abono()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sheet public.daily_sheets%ROWTYPE;
  v_previous public.dispatches%ROWTYPE;
  v_shift time;
  v_closed boolean;
  v_working boolean;
BEGIN
  SELECT * INTO v_sheet FROM public.daily_sheets WHERE id = NEW.daily_sheet_id;
  IF v_sheet.status <> 'OPEN' THEN RETURN NEW; END IF;
  SELECT previous.* INTO v_previous
  FROM public.dispatches previous JOIN public.daily_sheets sheet ON sheet.id = previous.daily_sheet_id
  WHERE sheet.date = v_sheet.date - 1 AND sheet.region = v_sheet.region AND previous.driver_id = NEW.driver_id;
  v_working := UPPER(TRIM(COALESCE(v_previous.dispatch_status,''))) IN ('ACIONADO','APOIO','TROCA','BALDEIO','VIAGEM FECHADA');
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
    NEW.forecast_start_time := CASE
      WHEN v_working THEN CASE WHEN v_previous.exit_time IS NULL THEN NULL ELSE v_previous.next_day_forecast_time END
      WHEN v_closed THEN NULL ELSE (v_shift - interval '4 hours')::time END;
    NEW.forecast_source := CASE WHEN v_working THEN 'CONTINUITY' ELSE 'SCHEDULE' END;
  END IF;
  IF UPPER(TRIM(COALESCE(v_previous.dispatch_status,''))) = 'ABONADO' THEN
    IF NULLIF(TRIM(NEW.abono_reason), '') IS NULL THEN NEW.abono_reason := 'Abonado ontem'; END IF;
  ELSIF NEW.abono_reason = 'Abonado ontem' THEN NEW.abono_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.propagate_dispatch_continuity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source_sheet public.daily_sheets%ROWTYPE;
  v_target_sheet public.daily_sheets%ROWTYPE;
BEGIN
  SELECT * INTO v_source_sheet FROM public.daily_sheets WHERE id = NEW.daily_sheet_id;
  SELECT * INTO v_target_sheet FROM public.daily_sheets
  WHERE date = v_source_sheet.date + 1 AND region = v_source_sheet.region AND status = 'OPEN';
  IF NOT FOUND THEN RETURN NEW; END IF;
  -- O trigger BEFORE calcula previsão e marcador a partir do status atualizado de D-1.
  UPDATE public.dispatches target SET
    origin_location_id = CASE WHEN target.origin_source <> 'MANUAL' THEN NEW.final_destination_location_id ELSE target.origin_location_id END,
    origin_source = CASE WHEN target.origin_source <> 'MANUAL' THEN 'CONTINUITY' ELSE target.origin_source END,
    forecast_start_time = target.forecast_start_time
  WHERE target.daily_sheet_id = v_target_sheet.id AND target.driver_id = NEW.driver_id;
  RETURN NEW;
END;
$$;

UPDATE public.dispatches target SET forecast_start_time = target.forecast_start_time
FROM public.daily_sheets sheet WHERE sheet.id = target.daily_sheet_id AND sheet.status = 'OPEN';
