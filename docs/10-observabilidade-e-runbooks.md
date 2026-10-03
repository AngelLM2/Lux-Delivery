# 10 — Observabilidade, SLOs e runbooks

## 1. Os três sinais

| Sinal | Implementação | Onde ver |
|---|---|---|
| **Logs** | JSON, uma linha por evento, com `request_id`, `user_id`, rota, status e `duration_ms` (`core/logging.py`, `core/middleware.py`) | `docker compose logs api` → Loki/ELK/CloudWatch |
| **Métricas** | Prometheus: RED por **template de rota** + métricas de negócio e de filas (`core/metrics.py`) | `http://localhost:3001` (Grafana) |
| **Traces** | correlação por `request_id` (gerado ou recebido do nginx); OpenTelemetry é o próximo passo ([07, estágio 4](07-escalabilidade/05-estagio-4-10k-a-100k-usuarios.md#6-observabilidade-de-métricas-para-rastreamento)) | — |

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
# Grafana: http://localhost:3001 (dashboard "Lux Delivery — Visao geral")
# Prometheus: http://localhost:9090/alerts
```

### Métricas expostas

| Métrica | Tipo | Para quê |
|---|---|---|
| `lux_http_requests_total{method,route,status}` | counter | tráfego e taxa de erro por rota |
| `lux_http_request_duration_seconds{method,route}` | histogram | p50/p95/p99 por rota |
| `lux_http_requests_in_progress` | gauge | saturação (Lei de Little) |
| `lux_load_shed_total` | counter | quantas requisições o limitador recusou (503) |
| `lux_rate_limited_total{scope}` | counter | abuso ou limite mal calibrado |
| `lux_cache_requests_total{namespace,result}` | counter | hit ratio do cache |
| `lux_db_pool_checked_out` | gauge | conexões do pool em uso |
| `lux_orders_created_total`, `lux_order_status_transitions_total{to}`, `lux_idempotent_replays_total` | counter | negócio |
| `lux_sse_connections` | gauge | conexões de tempo real abertas |
| `lux_outbox_pending`, `lux_outbox_published_total` | gauge/counter | atraso do pipeline de eventos (worker) |
| `lux_events_consumed_total{consumer,result}` | counter | ok / erro / dead-lettered por consumer group |
| `pg_*`, `redis_*` | exporters | conexões, transações, cache hit do Postgres, memória do Redis, tamanho dos streams |

**Por que template de rota:** `route="/api/v1/orders/{order_id}"` gera uma série por rota. Com o path
cru (`/orders/1`, `/orders/2`…) seria uma série por pedido, e o Prometheus cairia por cardinalidade.
Testado em `test_metrics_use_route_templates_not_raw_paths`.

## 2. SLIs e SLOs

| SLI | Definição (PromQL) | SLO | Orçamento de erro (30 dias) |
|---|---|---|---|
| Disponibilidade | `1 - (5xx / total)` | 99,9% | ~43 min |
| Latência de leitura | % de `GET` com duração ≤ 200 ms | 95% | — |
| Latência de escrita | % de `POST/PATCH` em pedidos com duração ≤ 400 ms | 95% | — |
| Frescor do tempo real | `lux_outbox_pending` ≈ 0 e consumers sem erro | < 2 s do commit ao evento | — |

**Por que medir 5xx e não 4xx:** um 4xx é o sistema funcionando (senha errada, transição inválida). Um
429 em excesso, porém, merece o alerta separado `RateLimitSpike`.

## 3. Alertas (`infra/prometheus/alerts.yml`)

| Alerta | Severidade | Por que existe |
|---|---|---|
| `HighErrorRate` (5xx > 1% por 5 min) | page | o usuário está vendo erros |
| `HighLatencyP95` (> 500 ms por 10 min) | page | o usuário está esperando |
| `WorkerDown` | page | notificações e tempo real parados silenciosamente |
| `ApiInstanceDown` | ticket | uma réplica fora (as outras seguram, então não acorda ninguém) |
| `OutboxBacklog` (> 500 por 5 min) | ticket | eventos atrasando |
| `DeadLetterGrowing` | ticket | bug em algum consumer |
| `PostgresConnectionsNearLimit` (> 80%) | ticket | hora do PgBouncer / revisar pools |
| `RedisMemoryHigh` (> 85%) | ticket | despejo de cache iminente |
| `RateLimitSpike` | info | abuso ou limite baixo demais |

Princípio: **alerta que acorda alguém (page) é sintoma do usuário**; causa vira ticket ou dashboard. Um
alerta que dispara e ninguém precisa agir deve ser apagado.

## 4. Runbooks

Formato: **sintoma → diagnóstico → ação**. Cada um responde "o que eu faço às 3 h da manhã".

### Alta taxa de 5xx
1. **Qual rota?** Grafana → painel "Status HTTP" e "Tráfego por rota", ou
   `sum by (route, status) (rate(lux_http_requests_total{status=~"5.."}[5m]))`.
2. **Qual erro?** `docker compose logs api | grep '"level": "ERROR"'`, depois pegue o `request_id`
   de uma linha e busque o contexto completo.
3. Causas e ações:
   | Código | Causa provável | Ação |
   |---|---|---|
   | `overloaded` (503) | load shedding ou pool do banco esgotado | escalar réplicas; checar queries lentas (`pg_stat_statements`) |
   | `internal_error` (500) | bug | rollback para a imagem anterior; depois corrigir |
   | 502/504 no nginx | réplicas fora ou travadas | `docker compose ps`; `/health/ready` de cada réplica |
4. Deploy recente? **Rollback primeiro, investigação depois.**

### Latência alta
1. Uma rota ou todas? Painel "p95 por rota".
2. Todas: saturação de CPU (`lux_http_requests_in_progress` alto, CPU da API ~100%) → escalar. Pool do
   banco (`lux_db_pool_checked_out` no teto) → ver o passo 3.
3. Uma rota: query lenta. No Postgres:
   ```sql
   SELECT calls, round(mean_exec_time::numeric, 1) AS ms, left(query, 120)
   FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
   ```
   e depois `EXPLAIN (ANALYZE, BUFFERS)` na pior.
4. `pg_stat_activity` com muitas conexões em `idle in transaction / ClientRead`: o banco está
   **esperando a aplicação**, e o gargalo é CPU da API, não do banco ([09](09-testes-de-carga.md#escrita-checkoutjs-contra-1-réplica)).

### Backlog no outbox
1. O worker está vivo? `docker compose ps worker`; `up{job="lux-worker"}`.
2. O Redis está acessível pelo worker? Logs `outbox_relay_error`.
3. Quantos e desde quando:
   ```sql
   SELECT count(*), min(occurred_at), max(attempts) FROM outbox_events WHERE published_at IS NULL;
   ```
4. Ação: reiniciar ou escalar o worker. Os eventos **não se perdem**: estão no Postgres e serão
   publicados quando o relay voltar. O efeito para o usuário é só atraso nas notificações e no tempo real.

### Dead-letter queue
Só vai para a DLQ o que é **bug** (o handler falhou 5 vezes com um erro da aplicação). Falhas de
infraestrutura (Postgres ou Redis fora, timeout de rede) **não contam tentativa**: a mensagem fica
pendente e o consumer recua com backoff, então uma queda do banco atrasa notificações mas não as
descarta (`test_infrastructure_failures_never_dead_letter_events`).

1. Ver as mensagens:
   ```bash
   docker compose exec redis redis-cli XRANGE lux:events:dlq - + COUNT 10
   ```
   Cada uma traz `group`, `error` e o payload original.
2. Corrigir o bug do handler e fazer deploy.
3. Reprocessar: reinjetar no stream principal (`XADD lux:events * ...` com os mesmos campos). Os
   consumers são idempotentes por `event_id`, então reprocessar é seguro.

### Redis fora do ar
Comportamento esperado (projetado e testado):
- catálogo e analytics continuam funcionando direto do Postgres (cache em *fail-open*);
- rate limit global desligado (*fail-open*), login/registro/refresh respondem **503** (*fail-closed*);
- tempo real parado (o hub tenta reconectar com backoff); notificações acumulam no outbox.
Ação: restaurar o Redis. Nenhuma ação de dados é necessária.

### Postgres fora do ar
- `/health/ready` → 503: os load balancers tiram as réplicas do pool; `/health/live` continua 200
  (as réplicas **não** são reiniciadas em loop).
- Ação: failover do gerenciado (estágio 2+) ou restore do backup (estágio 0–1, `scripts/restore.sh`).
- RPO: estágio 0–1 até 24 h (backup diário); estágio 2+ minutos (PITR).

## 5. Profiling em produção
Sem alterar código nem reiniciar o processo:
```bash
docker run --rm --pid=container:lux_delivery-api-1 --cap-add SYS_PTRACE python:3.13-slim \
  sh -c "pip install py-spy && py-spy dump --pid 1"          # pilhas de agora (processo travado?)
# ou "py-spy record --pid 1 --duration 30 --format raw -o /out/profile.txt"
```
Foi assim que se encontrou, no teste de carga, o cliente Redis recriado a cada chamada e a classe
genérica do Pydantic reconstruída por requisição ([09](09-testes-de-carga.md)).
