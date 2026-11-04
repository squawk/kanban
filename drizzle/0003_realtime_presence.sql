-- Presence ("who's viewing / editing") on private board channels.
-- Supabase checks presence reads against SELECT policies and presence updates
-- (channel.track) against INSERT policies, scoped by realtime.messages.extension.
--  - SELECT: broadcast + presence on the token's own board topic
--  - INSERT: presence only. Browsers still can't send broadcasts, so they can't
--    fake "board changed" signals; only the server (secret key) can.
-- Guarded: no-op on plain Postgres where the Supabase schemas don't exist.
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
        realtime.messages.extension IN ('broadcast', 'presence')
        AND (SELECT realtime.topic()) LIKE 'kanban-board-%'
        AND (SELECT realtime.topic()) = (SELECT auth.jwt() ->> 'kanban_topic')
      )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS "kanban board viewers can share presence" ON realtime.messages';
    EXECUTE $policy$
      CREATE POLICY "kanban board viewers can share presence"
      ON realtime.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        realtime.messages.extension = 'presence'
        AND (SELECT realtime.topic()) LIKE 'kanban-board-%'
        AND (SELECT realtime.topic()) = (SELECT auth.jwt() ->> 'kanban_topic')
      )
    $policy$;
  END IF;
END
$$;
