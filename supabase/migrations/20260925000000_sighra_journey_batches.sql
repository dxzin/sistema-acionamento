BEGIN;

ALTER TABLE public.sighra_query_jobs
  ADD COLUMN batch_id uuid;

CREATE INDEX sighra_query_batch
  ON public.sighra_query_jobs(requested_by, batch_id, created_at)
  WHERE batch_id IS NOT NULL;

CREATE FUNCTION public.enqueue_sighra_query_batch(
  p_user uuid,
  p_logins text[],
  p_since date
)
RETURNS SETOF public.sighra_query_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch uuid := gen_random_uuid();
  distinct_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  SELECT count(DISTINCT login) INTO distinct_count
  FROM unnest(p_logins) AS requested(login);

  IF distinct_count < 1 OR distinct_count > 50 OR
    EXISTS (SELECT 1 FROM unnest(p_logins) AS requested(login) WHERE login !~ '^[0-9]{1,20}$')
  THEN
    RAISE EXCEPTION 'INVALID_BATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sighra_query_jobs
    WHERE requested_by = p_user
      AND batch_id IS NOT NULL
      AND status IN ('queued', 'running')
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'BATCH_IN_PROGRESS';
  END IF;

  RETURN QUERY
  INSERT INTO public.sighra_query_jobs (
    requested_by,
    login,
    since_date,
    batch_id,
    expires_at
  )
  SELECT
    p_user,
    login,
    p_since,
    batch,
    now() + interval '15 minutes'
  FROM (SELECT DISTINCT requested_login AS login FROM unnest(p_logins) AS requested(requested_login)) requested
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_sighra_query_batch(uuid, text[], date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_sighra_query_batch(uuid, text[], date)
  TO service_role;

COMMIT;
