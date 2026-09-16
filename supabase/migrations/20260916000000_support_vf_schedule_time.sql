-- VF (viagem fechada) é uma indicação textual da escala, não um horário.
-- Ela é armazenada em shift_letter porque shift_time é uma coluna TIME.
CREATE OR REPLACE FUNCTION public.sync_open_daily_sheet_from_schedule_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule public.monthly_schedules%ROWTYPE;
  v_sheet public.daily_sheets%ROWTYPE;
  v_driver public.drivers%ROWTYPE;
  v_code text;
  v_is_closed_trip boolean;
  v_forecast time;
BEGIN
  SELECT * INTO v_schedule
  FROM public.monthly_schedules
  WHERE id = NEW.schedule_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE id = NEW.driver_id AND is_active = true;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_code := UPPER(TRIM(COALESCE(NEW.scale_code, '')));
  v_is_closed_trip := UPPER(TRIM(COALESCE(NEW.shift_letter, ''))) = 'VF';
  v_forecast := CASE
    WHEN v_is_closed_trip THEN NULL
    WHEN v_code = '1' THEN (COALESCE(NEW.shift_time, v_driver.default_start_time) - interval '4 hours')::time
    ELSE COALESCE(NEW.shift_time, v_driver.default_start_time)
  END;

  FOR v_sheet IN
    SELECT sheet.*
    FROM public.daily_sheets sheet
    WHERE sheet.date = make_date(v_schedule.year, v_schedule.month, NEW.day_of_month)
      AND sheet.status = 'OPEN'
      AND (
        sheet.region = v_schedule.region
        OR (v_schedule.region = 'MG' AND sheet.region = 'UBJP')
      )
  LOOP
    IF v_code IN ('F', 'FE', 'AF', 'DES', 'DESL') THEN
      UPDATE public.dispatches
      SET scale_day_status = v_code
      WHERE daily_sheet_id = v_sheet.id
        AND driver_id = NEW.driver_id;
    ELSE
      INSERT INTO public.dispatches (
        daily_sheet_id,
        driver_id,
        forecast_start_time,
        forecast_source,
        dispatch_status,
        scale_day_status,
        origin_source
      ) VALUES (
        v_sheet.id,
        NEW.driver_id,
        v_forecast,
        'SCHEDULE',
        '',
        NULLIF(v_code, ''),
        'SCHEDULE'
      )
      ON CONFLICT (daily_sheet_id, driver_id) DO UPDATE
      SET scale_day_status = EXCLUDED.scale_day_status,
          forecast_start_time = CASE
            WHEN dispatches.forecast_source = 'SCHEDULE'
              THEN EXCLUDED.forecast_start_time
            ELSE dispatches.forecast_start_time
          END;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_open_daily_sheet_after_schedule_entry
ON public.monthly_schedule_entries;

CREATE TRIGGER sync_open_daily_sheet_after_schedule_entry
AFTER INSERT OR UPDATE OF scale_code, shift_letter, shift_time
ON public.monthly_schedule_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_open_daily_sheet_from_schedule_entry();

REVOKE ALL ON FUNCTION public.sync_open_daily_sheet_from_schedule_entry() FROM PUBLIC;
