-- Entrada pode conter a sequência provisória (1°, 2°...) ou um horário real.
-- Os horários existentes são preservados na conversão.
ALTER TABLE public.dispatches
  ALTER COLUMN entry_time TYPE text USING entry_time::text;

ALTER TABLE public.dispatches
  ADD CONSTRAINT dispatch_entry_time_or_sequence CHECK (
    entry_time IS NULL
    OR entry_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    OR entry_time ~ '^[0-9]+[°º]$'
  );

-- Preserva autenticação, auditoria, bloqueio e conflitos da função atual.
DO $$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  v_definition := pg_get_functiondef('public.update_dispatch_with_audit(uuid,timestamptz,jsonb)'::regprocedure);
  v_updated := replace(
    v_definition,
    'NULLIF(p_changes->>''entry_time'', '''')::time',
    'NULLIF(p_changes->>''entry_time'', '''')'
  );
  IF v_definition = v_updated THEN
    RAISE EXCEPTION 'Não foi encontrada a conversão de entrada esperada; migração cancelada.';
  END IF;
  EXECUTE v_updated;
END;
$$;
