-- Login and passwords are set by the migrator from Secrets Manager, never in SQL files.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'catalog_reader') THEN
    CREATE ROLE catalog_reader NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'catalog_writer') THEN
    CREATE ROLE catalog_writer NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO catalog_reader, catalog_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO catalog_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO catalog_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO catalog_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO catalog_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO catalog_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO catalog_writer;
