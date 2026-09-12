-- Distingue o LOCAL calculado pelo sistema do valor definido pela operação.
-- Origens manuais são protegidas; origens automáticas acompanham a continuidade D-1 -> D.
ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS origin_source text NOT NULL DEFAULT 'SCHEDULE';

ALTER TABLE public.dispatches
  DROP CONSTRAINT IF EXISTS dispatches_origin_source_check;

ALTER TABLE public.dispatches
  ADD CONSTRAINT dispatches_origin_source_check
  CHECK (origin_source IN ('SCHEDULE', 'CONTINUITY', 'BASE', 'MANUAL'));

-- Conservadoramente protege origens que já passaram por uma edição feita na grade.
UPDATE public.dispatches AS dispatch
SET origin_source = 'MANUAL'
WHERE EXISTS (
  SELECT 1
  FROM public.audit_logs AS audit
  WHERE audit.entity_name = 'dispatches'
    AND audit.entity_id = dispatch.id
    AND audit.new_values ? 'origin_location_id'
);
