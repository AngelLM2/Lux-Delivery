-- Runs once, when the data volume is created.
-- pg_stat_statements: which queries consume the most time (see docs/09-testes-de-carga.md).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Safety net that survives PgBouncer: with transaction pooling the API cannot send
-- statement_timeout as a startup parameter, so it is a database-level default instead.
-- Migrations override it (alembic/env.py); reports widen it per transaction (SET LOCAL).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET statement_timeout = %L', current_database(), '5s');
  EXECUTE format('ALTER DATABASE %I SET idle_in_transaction_session_timeout = %L', current_database(), '60s');
END
$$;
