-- Mantém updated_at confiável para Realtime e para o polling de contingência.
DROP TRIGGER IF EXISTS trigger_monthly_schedule_entries_updated_at
ON public.monthly_schedule_entries;

CREATE TRIGGER trigger_monthly_schedule_entries_updated_at
BEFORE UPDATE ON public.monthly_schedule_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sincroniza a célula alterada com qualquer folha diária aberta correspondente.
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
  v_forecast := CASE
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
    IF v_code IN ('F', 'FE') THEN
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
      SET scale_day_status = EXCLUDED.scale_day_status;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_open_daily_sheet_after_schedule_entry
ON public.monthly_schedule_entries;

CREATE TRIGGER sync_open_daily_sheet_after_schedule_entry
AFTER INSERT OR UPDATE OF scale_code, shift_time
ON public.monthly_schedule_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_open_daily_sheet_from_schedule_entry();

-- Repara as linhas existentes das folhas abertas com o código atual da escala.
UPDATE public.dispatches dispatch
SET scale_day_status = entry.scale_code
FROM public.daily_sheets sheet
JOIN public.monthly_schedules schedule
  ON schedule.year = EXTRACT(YEAR FROM sheet.date)::integer
 AND schedule.month = EXTRACT(MONTH FROM sheet.date)::integer
 AND (
   schedule.region = sheet.region
   OR (schedule.region = 'MG' AND sheet.region = 'UBJP')
 )
JOIN public.monthly_schedule_entries entry
  ON entry.schedule_id = schedule.id
 AND entry.day_of_month = EXTRACT(DAY FROM sheet.date)::integer
WHERE dispatch.daily_sheet_id = sheet.id
  AND dispatch.driver_id = entry.driver_id
  AND sheet.status = 'OPEN'
  AND dispatch.scale_day_status IS DISTINCT FROM entry.scale_code;

-- Inclui quem estava em F/FE quando a folha foi criada e agora trabalha.
INSERT INTO public.dispatches (
  daily_sheet_id,
  driver_id,
  forecast_start_time,
  forecast_source,
  dispatch_status,
  scale_day_status,
  origin_source
)
SELECT
  sheet.id,
  driver.id,
  CASE
    WHEN UPPER(TRIM(entry.scale_code)) = '1'
      THEN (COALESCE(entry.shift_time, driver.default_start_time) - interval '4 hours')::time
    ELSE COALESCE(entry.shift_time, driver.default_start_time)
  END,
  'SCHEDULE',
  '',
  entry.scale_code,
  'SCHEDULE'
FROM public.daily_sheets sheet
JOIN public.monthly_schedules schedule
  ON schedule.year = EXTRACT(YEAR FROM sheet.date)::integer
 AND schedule.month = EXTRACT(MONTH FROM sheet.date)::integer
 AND (
   schedule.region = sheet.region
   OR (schedule.region = 'MG' AND sheet.region = 'UBJP')
 )
JOIN public.monthly_schedule_entries entry
  ON entry.schedule_id = schedule.id
 AND entry.day_of_month = EXTRACT(DAY FROM sheet.date)::integer
JOIN public.drivers driver
  ON driver.id = entry.driver_id
 AND driver.is_active = true
WHERE sheet.status = 'OPEN'
  AND UPPER(TRIM(entry.scale_code)) NOT IN ('F', 'FE')
ON CONFLICT (daily_sheet_id, driver_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.sync_open_daily_sheet_from_schedule_entry() FROM PUBLIC;
