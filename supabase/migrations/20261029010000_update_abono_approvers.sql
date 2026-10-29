UPDATE public.operational_params
SET value = '["MARCOS", "ROBERTO", "LEOVEGILDO", "PENDENTE"]'::jsonb
WHERE key = 'aprovadores_abono_permitidos';
