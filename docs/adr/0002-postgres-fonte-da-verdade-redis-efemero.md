# ADR-0002 — PostgreSQL como fonte da verdade, Redis só para dados efêmeros

- **Status:** aceito
- **Contexto:** precisamos de transações, constraints, locks de linha e consultas analíticas; também de
  cache, rate limit, pub/sub e uma fila de eventos.
- **Decisão:** tudo que não pode ser perdido mora no **Postgres** (inclusive o outbox de eventos e as
  chaves de idempotência). O **Redis** guarda apenas dados reconstruíveis: cache, contadores de rate
  limit, status de usuário em cache, Pub/Sub e o stream de eventos (cuja cópia durável é o outbox).
- **Alternativas:** idempotência ou fila de eventos só no Redis (inconsistência entre os dois sistemas
  numa falha); Mongo (perde transações e constraints relacionais que o domínio usa).
- **Consequências:** (+) perder o Redis degrada desempenho e tempo real, nunca dados (há runbook e
  testes de fail-open/fail-closed). (+) `maxmemory-policy volatile-lru` permite um único Redis até o
  estágio 4. (−) Duas tecnologias para operar desde o início.
