-- Runtime database role for Priority Agent.
--
-- The application connects as `priority_app`, a role that does NOT own the tables.
-- PostgreSQL therefore enforces the Row-Level Security policies created by the
-- migrations (table owners bypass RLS). Migrations and the seed run as the owner
-- (DIRECT_URL).
--
-- Production (Neon / Supabase / RDS): run this script once as the owner role and
-- replace the password. Then point DATABASE_URL at priority_app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'priority_app') THEN
    CREATE ROLE priority_app LOGIN PASSWORD 'priority_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE priority_agent TO priority_app;
GRANT USAGE ON SCHEMA public TO priority_app;

-- Existing objects
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO priority_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO priority_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO priority_app;

-- Objects created later by migrations (run as the current/owner role)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO priority_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO priority_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO priority_app;
