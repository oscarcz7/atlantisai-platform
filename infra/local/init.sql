-- Se ejecuta solo la primera vez que se crea el volumen local.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Usuario de la aplicación: sin BYPASSRLS, sujeto a Row-Level Security.
CREATE ROLE noah_app LOGIN PASSWORD 'noah_app' NOBYPASSRLS;
GRANT CONNECT ON DATABASE noah TO noah_app;
GRANT USAGE ON SCHEMA public TO noah_app;
ALTER DEFAULT PRIVILEGES FOR ROLE noah_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO noah_app;
ALTER DEFAULT PRIVILEGES FOR ROLE noah_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO noah_app;
