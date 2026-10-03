# Architecture Decision Records

Cada decisão relevante registra contexto, alternativas e consequências, para que a escolha possa ser
revista quando o contexto mudar (em vez de esquecida ou repetida).

| ADR | Decisão |
|---|---|
| [ADR-0001](0001-monolito-modular.md) | Monólito modular em vez de microserviços |
| [ADR-0002](0002-postgres-fonte-da-verdade-redis-efemero.md) | PostgreSQL como fonte da verdade, Redis só para dados efêmeros |
| [ADR-0003](0003-sessao-em-cookies-httponly.md) | Sessão em cookies HttpOnly com refresh token rotativo por família |
| [ADR-0004](0004-outbox-e-redis-streams.md) | Transactional outbox + Redis Streams (Kafka só quando houver gatilho) |
| [ADR-0005](0005-sse-em-vez-de-websocket.md) | Server-Sent Events em vez de WebSocket para tempo real |
| [ADR-0006](0006-lock-pessimista-nas-transicoes.md) | Lock pessimista (`SELECT … FOR UPDATE`) nas transições de status |
| [ADR-0007](0007-paginacao-keyset.md) | Paginação keyset com cursor opaco |
| [ADR-0008](0008-contrato-openapi-e-tipos-gerados.md) | Tipos do front gerados do OpenAPI, com checagem de drift no CI |
| [ADR-0009](0009-um-processo-por-container-e-load-shedding.md) | Um processo uvicorn por container + load shedding |
| [ADR-0010](0010-testes-com-postgres-e-redis-reais.md) | Testes de integração com Postgres e Redis reais |
