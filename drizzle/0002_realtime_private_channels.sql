-- Private Realtime channels: a browser may join (and receive broadcasts on) a channel
-- only if its JWT, signed by the app for one board, names that channel's topic in the
-- `kanban_topic` claim. There is deliberately no INSERT policy, so browsers can't send;
-- the server broadcasts with the secret key, which bypasses RLS.
--
-- Guarded so it's a no-op on plain Postgres (local dev, tests), where the Supabase
-- `realtime` and `auth` schemas don't exist. RLS is already enabled on
-- realtime.messages by Supabase (don't ALTER it here: we don't own that table).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'realtime')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'auth' AND p.proname = 'jwt') THEN
    EXECUTE 'DROP POLICY IF EXISTS "kanban board viewers can receive" ON realtime.messages';
    EXECUTE $policy$
      CREATE POLICY "kanban board viewers can receive"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        realtime.messages.extension = 'broadcast'
        AND (SELECT realtime.topic()) LIKE 'kanban-board-%'
        AND (SELECT realtime.topic()) = (SELECT auth.jwt() ->> 'kanban_topic')
      )
    $policy$;
  END IF;
END
$$;
