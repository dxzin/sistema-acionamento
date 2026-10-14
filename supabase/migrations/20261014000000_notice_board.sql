-- Quadro de Avisos colaborativo, com cartões, comentários, anexos e histórico.
CREATE TABLE IF NOT EXISTS public.notice_board_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_-]{2,40}$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  position integer NOT NULL CHECK (position >= 0),
  color text NOT NULL DEFAULT 'green' CHECK (color IN ('green', 'blue', 'amber', 'slate', 'violet')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notice_board_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES public.notice_board_columns(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  labels text[] NOT NULL DEFAULT '{}' CHECK (
    cardinality(labels) <= 5
    AND labels <@ ARRAY['operation', 'pending', 'safety', 'client', 'maintenance']::text[]
  ),
  due_date date,
  position integer NOT NULL DEFAULT 1000 CHECK (position >= 0),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notice_board_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.notice_board_cards(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notice_board_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.notice_board_cards(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notice_board_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid REFERENCES public.notice_board_cards(id) ON DELETE SET NULL,
  card_title text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'moved', 'commented', 'attached', 'deleted')),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notice_cards_column_position
  ON public.notice_board_cards(column_id, position) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notice_cards_assignee
  ON public.notice_board_cards(assignee_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notice_comments_card_created
  ON public.notice_board_comments(card_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notice_attachments_card_created
  ON public.notice_board_attachments(card_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notice_history_card_created
  ON public.notice_board_history(card_id, created_at DESC);

DROP TRIGGER IF EXISTS trigger_notice_columns_updated_at ON public.notice_board_columns;
CREATE TRIGGER trigger_notice_columns_updated_at
BEFORE UPDATE ON public.notice_board_columns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_notice_cards_updated_at ON public.notice_board_cards;
CREATE TRIGGER trigger_notice_cards_updated_at
BEFORE UPDATE ON public.notice_board_cards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_notice_comments_updated_at ON public.notice_board_comments;
CREATE TRIGGER trigger_notice_comments_updated_at
BEFORE UPDATE ON public.notice_board_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_manage_notice_board()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  );
$$;

CREATE OR REPLACE FUNCTION public.record_notice_board_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_title text;
  v_card_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'notice_board_cards' THEN
    IF TG_OP = 'DELETE' THEN
      v_card_id := OLD.id;
      v_title := OLD.title;
    ELSE
      v_card_id := NEW.id;
      v_title := NEW.title;
    END IF;
    IF TG_OP = 'INSERT' THEN
      v_action := 'created';
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'deleted';
    ELSIF NEW.column_id IS DISTINCT FROM OLD.column_id OR NEW.position IS DISTINCT FROM OLD.position THEN
      v_action := 'moved';
    ELSE
      v_action := 'updated';
    END IF;
    INSERT INTO public.notice_board_history(card_id, card_title, actor_id, action, details)
    VALUES (
      v_card_id, v_title, auth.uid(), v_action,
      CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
        'from_column_id', OLD.column_id, 'to_column_id', NEW.column_id,
        'from_priority', OLD.priority, 'to_priority', NEW.priority,
        'from_assignee_id', OLD.assignee_id, 'to_assignee_id', NEW.assignee_id
      ) ELSE '{}'::jsonb END
    );
  ELSIF TG_TABLE_NAME = 'notice_board_comments' AND TG_OP = 'INSERT' THEN
    SELECT title INTO v_title FROM public.notice_board_cards WHERE id = NEW.card_id;
    INSERT INTO public.notice_board_history(card_id, card_title, actor_id, action, details)
    VALUES (NEW.card_id, v_title, auth.uid(), 'commented', jsonb_build_object('comment_id', NEW.id));
  ELSIF TG_TABLE_NAME = 'notice_board_attachments' AND TG_OP = 'INSERT' THEN
    SELECT title INTO v_title FROM public.notice_board_cards WHERE id = NEW.card_id;
    INSERT INTO public.notice_board_history(card_id, card_title, actor_id, action, details)
    VALUES (NEW.card_id, v_title, auth.uid(), 'attached', jsonb_build_object('attachment_id', NEW.id, 'file_name', NEW.file_name));
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_notice_card_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE_CARD_OWNERSHIP';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_notice_card_ownership ON public.notice_board_cards;
CREATE TRIGGER protect_notice_card_ownership
BEFORE UPDATE ON public.notice_board_cards
FOR EACH ROW EXECUTE FUNCTION public.protect_notice_card_ownership();

DROP TRIGGER IF EXISTS notice_card_history ON public.notice_board_cards;
CREATE TRIGGER notice_card_history
AFTER INSERT OR UPDATE OR DELETE ON public.notice_board_cards
FOR EACH ROW EXECUTE FUNCTION public.record_notice_board_history();

DROP TRIGGER IF EXISTS notice_comment_history ON public.notice_board_comments;
CREATE TRIGGER notice_comment_history
AFTER INSERT ON public.notice_board_comments
FOR EACH ROW EXECUTE FUNCTION public.record_notice_board_history();

DROP TRIGGER IF EXISTS notice_attachment_history ON public.notice_board_attachments;
CREATE TRIGGER notice_attachment_history
AFTER INSERT ON public.notice_board_attachments
FOR EACH ROW EXECUTE FUNCTION public.record_notice_board_history();

ALTER TABLE public.notice_board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_board_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_board_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_board_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_board_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notice columns readable" ON public.notice_board_columns
FOR SELECT TO authenticated USING (true);
CREATE POLICY "notice columns manageable" ON public.notice_board_columns
FOR ALL TO authenticated USING (public.can_manage_notice_board()) WITH CHECK (public.can_manage_notice_board());

CREATE POLICY "notice cards readable" ON public.notice_board_cards
FOR SELECT TO authenticated USING (true);
CREATE POLICY "notice cards creatable" ON public.notice_board_cards
FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "notice cards collaborative update" ON public.notice_board_cards
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "notice cards deletable" ON public.notice_board_cards
FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.can_manage_notice_board());

CREATE POLICY "notice comments readable" ON public.notice_board_comments
FOR SELECT TO authenticated USING (true);
CREATE POLICY "notice comments creatable" ON public.notice_board_comments
FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "notice comments editable by author" ON public.notice_board_comments
FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "notice comments deletable" ON public.notice_board_comments
FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.can_manage_notice_board());

CREATE POLICY "notice attachments readable" ON public.notice_board_attachments
FOR SELECT TO authenticated USING (true);
CREATE POLICY "notice attachments creatable" ON public.notice_board_attachments
FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "notice attachments deletable" ON public.notice_board_attachments
FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR public.can_manage_notice_board());

CREATE POLICY "notice history readable" ON public.notice_board_history
FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.notice_board_history FROM authenticated, anon;
REVOKE ALL ON FUNCTION public.can_manage_notice_board() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_notice_board_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_notice_card_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_notice_board() TO authenticated;

REVOKE ALL ON public.notice_board_columns, public.notice_board_cards, public.notice_board_comments,
  public.notice_board_attachments, public.notice_board_history FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notice_board_columns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notice_board_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notice_board_comments TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.notice_board_attachments TO authenticated;
GRANT SELECT ON public.notice_board_history TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_notice_board_cards(p_orders jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_column text;
  v_cards jsonb;
  v_card text;
  v_position integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF jsonb_typeof(p_orders) <> 'object' THEN RAISE EXCEPTION 'INVALID_ORDERS'; END IF;

  FOR v_column, v_cards IN SELECT key, value FROM jsonb_each(p_orders)
  LOOP
    IF jsonb_typeof(v_cards) <> 'array' OR NOT EXISTS (
      SELECT 1 FROM public.notice_board_columns WHERE id = v_column::uuid
    ) THEN RAISE EXCEPTION 'INVALID_COLUMN'; END IF;
    v_position := 0;
    FOR v_card IN SELECT jsonb_array_elements_text(v_cards)
    LOOP
      v_position := v_position + 1000;
      UPDATE public.notice_board_cards
      SET column_id = v_column::uuid, position = v_position
      WHERE id = v_card::uuid AND archived_at IS NULL
        AND (column_id IS DISTINCT FROM v_column::uuid OR position IS DISTINCT FROM v_position);
      IF NOT FOUND AND NOT EXISTS (
        SELECT 1 FROM public.notice_board_cards WHERE id = v_card::uuid AND archived_at IS NULL
      ) THEN RAISE EXCEPTION 'INVALID_CARD'; END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_notice_board_cards(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_notice_board_cards(jsonb) TO authenticated;

INSERT INTO public.notice_board_columns(key, title, position, color)
VALUES
  ('notices', 'Avisos', 1000, 'blue'),
  ('in-progress', 'Em andamento', 2000, 'amber'),
  ('completed', 'Concluídos', 3000, 'green')
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets(id, name, public, file_size_limit)
VALUES ('notice-board-attachments', 'notice-board-attachments', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

CREATE POLICY "notice files readable" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'notice-board-attachments');
CREATE POLICY "notice files uploadable" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'notice-board-attachments'
  AND EXISTS (
    SELECT 1 FROM public.notice_board_cards
    WHERE id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY "notice files deletable" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'notice-board-attachments'
  AND (owner_id::text = auth.uid()::text OR public.can_manage_notice_board())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notice_board_columns') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notice_board_columns;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notice_board_cards') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notice_board_cards;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notice_board_comments') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notice_board_comments;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notice_board_attachments') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notice_board_attachments;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notice_board_history') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notice_board_history;
    END IF;
  END IF;
END $$;
