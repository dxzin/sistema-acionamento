-- Permite novos status digitados pelo operador sem limitar a lista padrão.
ALTER TABLE public.dispatches
  ALTER COLUMN dispatch_status DROP DEFAULT;

ALTER TABLE public.dispatches
  ALTER COLUMN dispatch_status TYPE text
  USING dispatch_status::text;

ALTER TABLE public.dispatches
  ALTER COLUMN dispatch_status SET DEFAULT 'ACIONADO';

DROP TYPE IF EXISTS public.dispatch_status_enum;
