-- Distingue previsão planejada, herdada e ajustada pela operação.
-- Isso permite atualizar a folha do dia seguinte sem sobrescrever edição manual.
ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS forecast_source text NOT NULL DEFAULT 'SCHEDULE';

ALTER TABLE public.dispatches
  DROP CONSTRAINT IF EXISTS dispatches_forecast_source_check;

ALTER TABLE public.dispatches
  ADD CONSTRAINT dispatches_forecast_source_check
  CHECK (forecast_source IN ('SCHEDULE', 'CONTINUITY', 'MANUAL'));
