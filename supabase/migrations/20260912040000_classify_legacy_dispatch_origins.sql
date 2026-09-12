-- Classifica origens anteriores à criação de origin_source.
-- Correspondências exatas com D-1 são automáticas; demais valores existentes
-- são protegidos como manuais/importados para evitar perda de dados históricos.
UPDATE public.dispatches AS current_dispatch
SET origin_source = 'CONTINUITY'
FROM public.daily_sheets AS current_sheet,
     public.daily_sheets AS previous_sheet,
     public.dispatches AS previous_dispatch
WHERE current_dispatch.daily_sheet_id = current_sheet.id
  AND previous_sheet.region = current_sheet.region
  AND previous_sheet.date = current_sheet.date - 1
  AND previous_dispatch.daily_sheet_id = previous_sheet.id
  AND previous_dispatch.driver_id = current_dispatch.driver_id
  AND previous_dispatch.final_destination_location_id IS NOT NULL
  AND current_dispatch.origin_location_id = previous_dispatch.final_destination_location_id
  AND current_dispatch.origin_source <> 'MANUAL';

UPDATE public.dispatches
SET origin_source = 'MANUAL'
WHERE origin_source = 'SCHEDULE'
  AND origin_location_id IS NOT NULL;
