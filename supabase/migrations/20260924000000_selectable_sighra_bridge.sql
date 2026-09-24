-- Mantém o estado das duas pontes e permite escolher qual delas consome a fila.
ALTER TABLE public.sighra_bridge_status
  DROP CONSTRAINT IF EXISTS sighra_bridge_status_id_check;

ALTER TABLE public.sighra_bridge_status
  ADD CONSTRAINT sighra_bridge_status_id_check
  CHECK (id IN ('empresa', 'notebook'));

CREATE TABLE public.sighra_bridge_config (
  id text PRIMARY KEY CHECK (id = 'active'),
  active_bridge text NOT NULL CHECK (active_bridge IN ('empresa', 'notebook')),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sighra_bridge_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sighra_bridge_config FROM anon, authenticated;
GRANT ALL ON public.sighra_bridge_config TO service_role;
