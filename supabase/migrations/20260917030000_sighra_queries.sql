ALTER TABLE public.sighra_bridge_status ADD COLUMN query_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.sighra_query_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 login text NOT NULL CHECK (login ~ '^[0-9]{1,20}$'),
 since_date date NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '3 minutes',
 lease_until timestamptz,
 lease_token uuid,
 attempts integer NOT NULL DEFAULT 0,
 result jsonb,
 error text,
 completed_at timestamptz
);
CREATE INDEX sighra_query_queue ON public.sighra_query_jobs(status, created_at);
CREATE INDEX sighra_query_user ON public.sighra_query_jobs(requested_by, created_at);
ALTER TABLE public.sighra_query_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sighra_query_jobs FROM anon, authenticated;
GRANT ALL ON public.sighra_query_jobs TO service_role;

CREATE FUNCTION public.enqueue_sighra_query(p_user uuid, p_login text, p_since date)
RETURNS SETOF public.sighra_query_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.sighra_query_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
 SELECT * INTO existing FROM public.sighra_query_jobs
 WHERE requested_by=p_user AND login=p_login AND status IN ('queued','running') AND expires_at>now()
 ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN NEXT existing; RETURN; END IF;
 IF (SELECT count(*) FROM public.sighra_query_jobs WHERE requested_by=p_user AND created_at>now()-interval '1 minute')>=10
 OR (SELECT count(*) FROM public.sighra_query_jobs WHERE requested_by=p_user AND status IN ('queued','running') AND expires_at>now())>=5
 THEN RAISE EXCEPTION 'QUERY_RATE_LIMIT'; END IF;
 RETURN QUERY INSERT INTO public.sighra_query_jobs(requested_by,login,since_date) VALUES(p_user,p_login,p_since) RETURNING *;
END $$;

CREATE FUNCTION public.claim_sighra_query()
RETURNS SETOF public.sighra_query_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 RETURN QUERY WITH candidate AS (
  SELECT id FROM public.sighra_query_jobs WHERE expires_at>now() AND attempts<2
  AND (status='queued' OR (status='running' AND lease_until<now()))
  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE public.sighra_query_jobs j SET status='running', lease_token=gen_random_uuid(),
 lease_until=now()+interval '60 seconds', attempts=attempts+1 FROM candidate c WHERE j.id=c.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_sighra_query(uuid,text,date), public.claim_sighra_query() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_sighra_query(uuid,text,date), public.claim_sighra_query() TO service_role;
