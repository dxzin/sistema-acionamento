-- Heartbeats gravados apenas pelo servidor; sem acesso direto pelo navegador.
CREATE TABLE public.sighra_bridge_status (
    id text PRIMARY KEY CHECK (id = 'empresa'),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    database_ok boolean NOT NULL,
    last_database_ok_at timestamptz
);
ALTER TABLE public.sighra_bridge_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sighra_bridge_status FROM anon, authenticated;
GRANT ALL ON public.sighra_bridge_status TO service_role;
