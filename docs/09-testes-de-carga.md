# 09 — Testes de carga: medir, achar o gargalo, corrigir, medir de novo

> Números medidos neste repositório em 2026-10-03, não estimados. A metodologia importa mais do
> que os números absolutos: o teste encontrou **quatro problemas reais** que nenhum teste funcional
> pegaria, e cada correção foi validada com uma nova medição.

## 1. Ambiente e metodologia

| Item | Valor |
|---|---|
| Máquina | notebook, Docker Desktop (WSL2), **12 vCPU / 6 GB** para a VM |
| Dados | `seed --orders 100000 --days 120`: 100 mil pedidos, 237 mil itens, 485 mil eventos de tracking (~125 MB) |
| API | 1 processo uvicorn por container (≈ 1 núcleo efetivo por réplica, por causa do GIL) |
| Gerador | k6 1.3, **dentro da mesma rede e da mesma máquina** que a stack (disputa CPU com ela) |
| Executor | `ramping-arrival-rate` / `constant-arrival-rate`: taxa de chegada fixa, como tráfego real (o k6 não espera a resposta para mandar a próxima, então a fila aparece) |
| Rate limit | desligado no overlay de carga (todo o tráfego do k6 sai de um IP) |

Cenários (`loadtest/k6/`):

| Script | O que simula |
|---|---|
| `browse.js` | visitante anônimo: 35% categorias, 45% produtos (metade filtrada por categoria), 20% detalhe de produto |
| `checkout.js` | clientes autenticados criando pedidos com `Idempotency-Key` (10% repetem a requisição, simulando rede instável) e listando os seus pedidos, mais atendentes avançando pedidos no quadro (o 409 de concorrência é esperado) |

```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml run --rm k6 run /scripts/browse.js
# 3 réplicas + PgBouncer: adicione -f docker-compose.scale.yml
```

## 2. A jornada (cada linha é uma medição real)

### Leitura: `browse.js` contra 1 réplica

| # | Mudança | RPS servidos | p95 catálogo | Erros | O que o diagnóstico mostrou |
|---|---|---|---|---|---|
| 0 | código inicial, alvo 600 RPS | 225 | **7,7 s** | 5,95% | logs: 1.842 × `Too many connections` no Redis |
| 1 | pool do Redis **bloqueante** + pool do banco esgotado vira **503** | 322 | 2,5–4 s | 8,2% | o processo Python a 100% de CPU; o Postgres quase ocioso |
| 2 | cliente Redis único, cache em **1 ida** (Lua) servindo **bytes prontos** | 365 | 1,2 s | 8,6% | `py-spy`: custo espalhado pelo framework, sem ponto quente único |
| 3 | **load shedding** (máx. 200 requisições em voo por processo) | **410** | **0,35 s** | 5,3% (503 rápidos) | latência máxima cai de 27 s para 5 s |
| — | mesma réplica a 300 RPS (abaixo da saturação) | 246 | 0,28 s (mediana 5 ms) | 0,3% | CPU da API 80–100%, Postgres 3–11%, Redis ~5% |

### Problema 1: um pool pequeno virou uma cascata de falhas

```
pool do Redis (50, não bloqueante) esgota
  └─> redis-py lança "Too many connections"
        └─> cache faz fail-open e vai ao Postgres em TODA requisição   (stampede)
              └─> pool do SQLAlchemy (20) esgota
                    └─> requisições esperam 10 s e viram 500
```

*Fail-open* é a decisão certa para uma **queda** do Redis, mas aqui o Redis estava saudável: o
problema era o tamanho do pool. Correção: `BlockingConnectionPool` (espera até 2 s por uma conexão
livre) e `sqlalchemy.exc.TimeoutError → 503 + Retry-After` em vez de 500. Lição:
**um mecanismo de resiliência mal calibrado amplifica a falha que deveria conter.**

### Problema 2: CPU desperdiçada no caminho quente

Com o `py-spy` anexado ao container em produção simulada (sem alterar código):

```bash
docker run --rm --pid=container:lux_delivery-api-1 --cap-add SYS_PTRACE python:3.13-slim \
  sh -c "pip install py-spy && py-spy record --pid 1 --duration 20 --format raw -o /out/profile.txt"
```

| Achado | Custo | Correção |
|---|---|---|
| `redis.Redis(connection_pool=…)` criado a cada chamada (copia ~300 callbacks) | ~0,5 ms/req | um cliente por processo |
| cache fazia 2 idas ao Redis (versão do namespace + valor) | 1 RTT/req | script Lua lê os dois de uma vez |
| hit de cache fazia `json.loads` + validação Pydantic + `json.dumps` | ~0,3 ms/req | resposta devolve a string do cache como está |

### Problema 3: sem load shedding, a fila é infinita

Pela Lei de Little (`em voo = vazão × latência`), uma réplica com ~400 RPS e orçamento de 250 ms
precisa de ~100 requisições em voo. Acima disso, aceitar mais requisições não aumenta a vazão: só
aumenta a fila e, com ela, a latência de **todo mundo**. Pela teoria de filas (M/M/1, `latência ∝
1/(1-ρ)`), o p95 explode perto de 100% de utilização. Por isso:

- `LoadShedMiddleware` responde **503 + `Retry-After: 1`** imediatamente acima de 200 requisições em voo;
- o HPA dos manifests k8s mira **65% de CPU**, e não 90%.

### Escrita: `checkout.js` contra 1 réplica

| # | Mudança | Pedidos/s | p95 | Erros | Diagnóstico |
|---|---|---|---|---|---|
| 0 | código inicial | 25 | **1,42 s** (todas as rotas) | 0,02% | Postgres: 12–19 conexões `idle in transaction` esperando `ClientRead`; API a 100%, banco a 30% |
| 1 | aliases de `Page[T]` + pedido montado em memória (sem re-SELECT após o commit) | 25 | **182 ms** no `POST /orders` (mediana 24 ms) | 0% | |
| — | mesma versão, 40 pedidos/s | 40 | 5,2 s no `POST /orders` | 9,8% | saturação de CPU da réplica |

**Problema 4 (Pydantic):** `Page[OrderSummary](…)` dentro do service fazia o Pydantic **reconstruir
a classe genérica** sob carga. O cache de parametrizações é fraco (*weak*) e o GC descartava a
classe entre requisições: ~7% da CPU gastos em geração de schema. Correção: aliases com referência
forte no módulo (`OrderSummaryPage = Page[OrderSummary]`).

**Transações abertas esperando a aplicação:** o sintoma `idle in transaction / ClientRead` no
`pg_stat_activity` significa que o banco está esperando o **cliente**, não o contrário. Com a CPU do
Python saturada, cada `await` demora a ser retomado e a transação fica aberta, segurando conexão e
locks. Reduzir o trabalho por transação (menos queries, sem re-SELECT do agregado) cortou o p95 em
~8×.

## 3. Escala horizontal: 1 réplica vs 3 réplicas + PgBouncer

| Cenário | 1 réplica | 3 réplicas + PgBouncer |
|---|---|---|
| Leitura, alvo 500 RPS | 410 RPS servidos, p95 **350 ms**, 5,3% de erro | 413 RPS servidos, p95 **7 ms**, **0%** de erro |
| Leitura, alvo 900 RPS | — | 728 RPS servidos, p95 600 ms, 6,3% de erro (saturou) |
| Escrita, 25 pedidos/s | p95 182 ms, 0% | — |
| Escrita, 40 pedidos/s | p95 5,2 s, 9,8% | p95 **161 ms**, **0%** |
| Escrita, 80 pedidos/s | — | p95 3,7 s, 14% (saturou) |
| Distribuição entre réplicas | — | 25,3 mil / 24,3 mil / 27,1 mil requisições (nginx round-robin) |
| Conexões reais no Postgres | até 20 por réplica | **24 no total** (o PgBouncer multiplexa) |
| Consistência sob saturação | 0 chaves de idempotência duplicadas, 0 eventos presos no outbox | idem |

**Por que 3 réplicas não deram 3× na leitura (728 e não ~1.200 RPS)?** O k6 (com 900 VUs), o nginx,
as 3 APIs, o worker, o Postgres e o Redis disputavam os mesmos 12 vCPUs. Num ambiente real, o gerador
de carga roda em outra máquina e cada réplica tem CPU dedicada. A conclusão que vale é a qualitativa:
**a API é stateless e escala linearmente até o próximo gargalo compartilhado.**

### O que satura depois da API (80 pedidos/s, 3 réplicas)

```
api-1  ~100%   api-2 ~99%   api-3 ~100%      <- ainda o gargalo principal
worker  ~93%                                 <- 1 processo: relay + 2 consumers; precisa de réplicas
db      ~95%                                 <- Postgres começa a pesar (commits, NOTIFY, índices)
pgbouncer ~60%                               <- single-threaded: perto do limite de um núcleo
redis   ~15%                                 <- folgado
```

Esse é o roteiro do [estágio 4 do tutorial](07-escalabilidade/05-estagio-4-10k-a-100k-usuarios.md):
réplicas do worker (o design já permite: `SKIP LOCKED` + consumer groups), um primário Postgres maior
com réplica de leitura, e várias instâncias de PgBouncer (ou `so_reuseport`).

## 4. Traduzindo para usuários

Usando o modelo de [01 — Requisitos](01-requisitos-e-capacidade.md#4-modelo-de-carga-back-of-the-envelope)
(RPS de pico ≈ DAU × 0,0033; pedidos/s de pico ≈ DAU × 0,000033):

| Capacidade medida (com folga para p95 < 250 ms) | Limite de usuários ativos/dia |
|---|---|
| 1 réplica, leitura: ~250 RPS | ~75 mil DAU |
| 1 réplica, escrita: ~25 pedidos/s | ~750 mil DAU (a escrita não é o gargalo) |
| 3 réplicas, leitura: ~600 RPS (nesta máquina) | ~180 mil DAU |

Ou seja: **a leitura do cardápio limita muito antes da escrita de pedidos**. O primeiro investimento
de escala é cache na borda (CDN para `GET /products` e `/categories`, que já mandam `Cache-Control:
public, max-age=30, stale-while-revalidate=120`). Com 90% de acerto na CDN, a mesma réplica atende
~10× mais usuários. O estágio 3 do tutorial mostra a configuração.

## 5. Latência do pipeline de eventos

20 pedidos sequenciais, medindo do retorno do `POST /orders` até o evento aparecer no Redis Stream e
até a notificação existir no banco (o worker processa os dois consumer groups):

| Trecho | p50 | p95 | máx |
|---|---|---|---|
| resposta → evento no stream (`LISTEN/NOTIFY` acorda o relay) | 20 ms | 27 ms | 32 ms |
| resposta → notificação gravada (stream → consumer → `INSERT`) | 32 ms | 48 ms | 61 ms |

Sem o `NOTIFY`, o piso seria o intervalo de polling do relay (1 s), ou seja, ~25× mais lento.

## 6. Planos de query com 100 mil pedidos

Detalhados em [03 — Modelagem](03-modelagem-de-dados.md#validando-com-explain-e-o-bug-que-ele-encontrou):
o teste de carga motivou o `EXPLAIN`, que revelou o cursor keyset não *sargável* (8 ms → 0,2 ms com
comparação de tupla). Hoje isso é protegido por um teste que lê o plano.

## 7. Próximas otimizações (não feitas, em ordem de retorno esperado)

| Ideia | Ganho esperado | Custo |
|---|---|---|
| CDN na frente do catálogo | 5–10× na leitura | baixo (só configuração) |
| Réplicas do worker | elimina o próximo gargalo de escrita | zero código |
| `orjson`/`msgspec` na serialização de listas | 10–20% de CPU nas listas | baixo |
| SQLAlchemy Core (sem ORM) em `POST /orders` | ~30% de CPU no caminho de escrita (o ORM é ~35% do profile) | médio, perde ergonomia |
| Mais de um processo por container (`WEB_CONCURRENCY`) | usa mais núcleos por pod | métricas Prometheus passam a exigir modo multiprocess |
