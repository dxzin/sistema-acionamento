-- Índices para o token de sincronização e a paginação do histórico.
CREATE INDEX IF NOT EXISTS idx_dispatches_sheet_updated_at
  ON public.dispatches(daily_sheet_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
  ON public.audit_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp
  ON public.audit_logs(user_id, timestamp DESC);
