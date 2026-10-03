# Testes de carga (k6)

Análise completa e números: [docs/09-testes-de-carga.md](../docs/09-testes-de-carga.md).

| Script | Cenário | Variáveis |
|---|---|---|
| `k6/browse.js` | visitante anônimo navegando pelo cardápio (`ramping-arrival-rate`) | `PEAK_RPS` (400), `RAMP` (30s), `HOLD` (60s) |
| `k6/checkout.js` | clientes criando pedidos com `Idempotency-Key` (10% repetem) + atendentes avançando pedidos | `ORDERS_RPS` (40), `ADMIN_RPS` (10), `DURATION` (60s), `CUSTOMERS` (20) |

```bash
# stack com rate limit desligado (todo o tráfego do k6 sai de um único IP)
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d --build

docker compose -f docker-compose.yml -f docker-compose.loadtest.yml run --rm k6 run /scripts/browse.js
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml run --rm \
  -e ORDERS_RPS=25 k6 run --summary-export=/results/checkout.json /scripts/checkout.js

# 3 réplicas + PgBouncer: adicione -f docker-compose.scale.yml (e recrie o "web" para o nginx ver as réplicas)
```

No Windows com Git Bash, prefixe os comandos com `MSYS_NO_PATHCONV=1` para que `/scripts/...` não seja
convertido para um caminho do Windows.

Dados realistas para os planos de query: `docker compose run --rm seed python -m app.scripts.seed --reset --orders 100000 --days 120`.

`results/` guarda os resumos (`--summary-export`) usados na documentação.
