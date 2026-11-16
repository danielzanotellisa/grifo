-- Row Level Security (ADR 0016). Idempotent; applied after the migrations by `pnpm db:setup` (or `pnpm db:rls`).
-- Every request runs inside withUser(), which sets app.user_id for the transaction.
-- After a transaction-local set_config the setting reads '' (not NULL) on a reused connection, hence nullif.
-- A new owned table must be added to the owner-isolation list below; the integration test fails otherwise.

GRANT USAGE ON SCHEMA platform, library, annotation, outline, study, export TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, library, annotation, outline, study, export TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA platform TO app_user;

-- Tables created by later migrations (run by the migrator role) are granted without rerunning this file.
ALTER DEFAULT PRIVILEGES IN SCHEMA platform, library, annotation, outline, study, export
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Authentication (ADR 0034): the identity schema belongs to auth_user alone. Credentials and sessions
-- are protected by grants, not by RLS: the library looks a user up by email before it knows who it is.
REVOKE ALL ON ALL TABLES IN SCHEMA identity FROM app_user;
REVOKE ALL ON SCHEMA identity FROM app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity REVOKE ALL ON TABLES FROM app_user;
GRANT USAGE ON SCHEMA identity TO auth_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_user;
ALTER TABLE identity.users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.users DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_only ON identity.users;

-- Graphile Worker (ADR 0029): its schema is installed by `pnpm db:queue` (migrator role).
-- app_user enqueues (web) and processes (worker) jobs. Job tables hold no owner_id; payloads carry it.
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphile_worker') THEN
    GRANT USAGE ON SCHEMA graphile_worker TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA graphile_worker TO app_user;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA graphile_worker TO app_user;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA graphile_worker TO app_user;
    -- Graphile Worker turns RLS on for its private tables and ships no policy, so a role that does not
    -- own them (app_user) could neither enqueue nor run a job. These tables hold ids and payloads, no
    -- owner data: the application role gets an explicit policy on each.
    FOREACH t IN ARRAY ARRAY['_private_jobs', '_private_tasks', '_private_job_queues', '_private_known_crontabs'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS app_user_queue ON graphile_worker.%I', t);
      EXECUTE format('CREATE POLICY app_user_queue ON graphile_worker.%I FOR ALL TO app_user USING (true) WITH CHECK (true)', t);
    END LOOP;
  ELSE
    RAISE NOTICE 'graphile_worker schema missing: run pnpm db:queue first';
  END IF;
END $$;

-- Owner isolation for every owned table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'library.subjects', 'library.stored_files', 'library.documents',
    'annotation.categories', 'annotation.highlights',
    'outline.nodes',
    'study.flashcards',
    'export.exports',
    'platform.change_log', 'platform.processed_mutations'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_isolation ON %s', t);
    EXECUTE format(
      'CREATE POLICY owner_isolation ON %s USING (owner_id = nullif(current_setting(''app.user_id'', true), '''')::uuid) WITH CHECK (owner_id = nullif(current_setting(''app.user_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;
