-- Alinha somente a folha operacional de amanhã com D-1 após instalar o trigger.
WITH links AS (
  SELECT target.id AS target_id, previous.*
  FROM public.daily_sheets target_sheet
  JOIN public.daily_sheets previous_sheet
    ON previous_sheet.date = target_sheet.date - 1
   AND previous_sheet.region = target_sheet.region
  JOIN public.dispatches target ON target.daily_sheet_id = target_sheet.id
  JOIN public.dispatches previous
    ON previous.daily_sheet_id = previous_sheet.id
   AND previous.driver_id = target.driver_id
  WHERE target_sheet.status = 'OPEN'
    AND target_sheet.date = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1
)
UPDATE public.dispatches target SET
  origin_location_id = CASE WHEN target.origin_source <> 'MANUAL' THEN links.final_destination_location_id ELSE target.origin_location_id END,
  origin_source = CASE WHEN target.origin_source <> 'MANUAL' THEN 'CONTINUITY' ELSE target.origin_source END,
  forecast_start_time = CASE
    WHEN target.forecast_source = 'MANUAL' THEN target.forecast_start_time
    WHEN UPPER(TRIM(COALESCE(links.dispatch_status, ''))) = 'ACIONADO' AND links.exit_time IS NULL THEN NULL
    WHEN links.next_day_forecast_time IS NOT NULL THEN links.next_day_forecast_time
    ELSE target.forecast_start_time
  END,
  forecast_source = CASE
    WHEN target.forecast_source = 'MANUAL' THEN target.forecast_source
    WHEN (UPPER(TRIM(COALESCE(links.dispatch_status, ''))) = 'ACIONADO' AND links.exit_time IS NULL)
      OR links.next_day_forecast_time IS NOT NULL THEN 'CONTINUITY'
    ELSE target.forecast_source
  END
FROM links
WHERE target.id = links.target_id;
