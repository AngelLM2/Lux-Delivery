# ADR-0010 — Testes de integração com Postgres e Redis reais

- **Status:** aceito
- **Contexto:** os comportamentos mais importantes dependem do banco e do Redis de verdade: `FOR UPDATE`,
  `ON CONFLICT`, índices parciais, `NUMERIC`, `pg_notify`, scripts Lua, Streams com consumer groups.
- **Decisão:** a suíte recria um banco `*_test` (recusa qualquer outro nome), aplica **as migrations
  reais** (`alembic upgrade head`) e limpa as tabelas entre testes; o Redis é real (db 15). SQLite e
  mocks de banco não são usados. Para SSE, um uvicorn real sobe no mesmo event loop do teste.
- **Alternativas:** SQLite em memória (sem locks/`ON CONFLICT` equivalentes), mocks (testam o mock),
  testcontainers (boa opção; a escolha atual usa os serviços do compose/CI por simplicidade).
- **Consequências:** (+) os testes pegaram bugs reais (lock, NOTIFY, nomes de constraint, drift). (+) As
  migrations são testadas a cada execução, inclusive o `alembic check`. (−) Precisa de Docker para rodar
  os testes (~20 s para a suíte inteira).
