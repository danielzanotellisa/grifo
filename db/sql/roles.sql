-- Application role (ADR 0016): web and worker connect as app_user, which can never bypass RLS.
-- Idempotent; applied by `pnpm db:setup` before the migrations. Local development password only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END $$;
