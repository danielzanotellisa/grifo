-- Runs once, on an empty data volume.
-- app_user is what the web and worker processes use: it can never bypass RLS (ADR 0016).
CREATE ROLE app_user LOGIN PASSWORD 'app_user' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE grifo TO app_user;
