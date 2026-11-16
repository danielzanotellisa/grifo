-- Row Level Security (ADR 0016). Idempotent; applied after the migrations by `pnpm db:setup` (or `pnpm db:rls`).
-- Every request runs inside withUser(), which sets app.user_id for the transaction.
-- After a transaction-local set_config the setting reads '' (not NULL) on a reused connection, hence nullif.
-- A new owned table must be added to the owner-isolation list below; the integration test fails otherwise.

GRANT USAGE ON SCHEMA platform, identity, library, annotation, outline, study, export TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, identity, library, annotation, outline, study, export TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA platform TO app_user;

-- Tables created by later migrations (run by the migrator role) are granted without rerunning this file.
ALTER DEFAULT PRIVILEGES IN SCHEMA platform, identity, library, annotation, outline, study, export
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Graphile Worker (ADR 0029): its schema is installed by `pnpm db:queue` (migrator role).
-- app_user enqueues (web) and processes (worker) jobs. Job tables hold no owner_id; payloads carry it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphile_worker') THEN
    GRANT USAGE ON SCHEMA graphile_worker TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA graphile_worker TO app_user;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA graphile_worker TO app_user;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA graphile_worker TO app_user;
  ELSE
    RAISE NOTICE 'graphile_worker schema missing: run pnpm db:queue first';
  END IF;
END $$;

-- identity.users: a user sees only their own row.
ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_only ON identity.users;
CREATE POLICY self_only ON identity.users
  USING (id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.user_id', true), '')::uuid);

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
