-- Application role (ADR 0016): web and worker connect as app_user, which can never bypass RLS.
-- Authentication role (ADR 0034): only the authentication library connects as auth_user, and it can reach
-- only the identity schema (see rls.sql).
-- Idempotent; applied by `pnpm db:setup` before the migrations. Local development passwords only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auth_user') THEN
    CREATE ROLE auth_user LOGIN PASSWORD 'auth_user' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO auth_user', current_database());
END $$;
