-- DESL representa condutor desligado e, assim como F/FE, não deve entrar
-- nas folhas de acionamento abertas.
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
    IF v_code IN ('F', 'FE', 'DESL') THEN
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

-- Atualiza a fotografia das folhas abertas; as linhas ficam preservadas no
-- banco para auditoria, mas deixam de ser exibidas pelo acionamento.
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
  AND UPPER(TRIM(entry.scale_code)) = 'DESL'
  AND dispatch.scale_day_status IS DISTINCT FROM entry.scale_code;

REVOKE ALL ON FUNCTION public.sync_open_daily_sheet_from_schedule_entry() FROM PUBLIC;
