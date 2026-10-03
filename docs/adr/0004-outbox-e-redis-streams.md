# ADR-0004 — Transactional outbox + Redis Streams (Kafka só quando houver gatilho)

- **Status:** aceito
- **Contexto:** criar e mudar pedidos precisa disparar notificações e atualizações em tempo real (e, no
  futuro, cobrança e entregadores) sem perder eventos e sem atrasar a resposta HTTP.
- **Decisão:** o evento é gravado em `outbox_events` **na mesma transação** da mudança de negócio, com
  `pg_notify` para acordar o relay. Um worker separado publica no Redis Stream `lux:events` (`FOR UPDATE
  SKIP LOCKED`); consumer groups independentes (`notifications`, `realtime`) processam com idempotência
  por `event_id`, reentrega via `XAUTOCLAIM` e dead-letter após 5 tentativas.
- **Alternativas:** publicar direto depois do commit (dual write: evento perdido se o processo morrer);
  BackgroundTasks do FastAPI (morrem com o processo, sem retry); Kafka/RabbitMQ (mais uma peça para
  operar, sem necessidade no volume atual).
- **Gatilhos para migrar para Kafka:** retenção longa para *replay* (dias), muitos consumidores de
  times diferentes, ou vazão acima de ~50 mil eventos/s (estágio 6). A troca é localizada no relay.
- **Consequências:** (+) at-least-once garantido; o evento sobrevive a queda do Redis e do worker.
  (−) Consistência eventual (segundos) para notificações; consumers obrigatoriamente idempotentes.
