# 06 — Concorrência e consistência

> Num sistema de pedidos, os bugs caros não são exceções, e sim **condições de corrida**: o cliente
> que clica duas vezes, a rede que reenvia, dois atendentes mexendo no mesmo pedido, o processo que
> morre entre "salvar" e "avisar". Este documento mostra cada corrida, o mecanismo que a resolve e o
> teste que prova a solução.

| # | Problema | Mecanismo | Teste |
|---|---|---|---|
| 1 | Pedido duplicado por retry/duplo clique | `Idempotency-Key` + `UNIQUE (user_id, key)` | `test_concurrent_retries_with_the_same_key_create_one_order` |
| 2 | Duas transições simultâneas no mesmo pedido | `SELECT … FOR UPDATE` + revalidação | `test_concurrent_transitions_are_serialised_by_the_row_lock` |
| 3 | "Salvei o pedido mas o evento se perdeu" (dual write) | Transactional outbox | `test_outbox_row_is_written_in_the_same_transaction_as_the_order` |
| 4 | Evento entregue duas vezes | Consumer idempotente (`UNIQUE source_event_id`) | `test_notifications_consumer_is_idempotent_under_redelivery` |
| 5 | Mensagem venenosa trava a fila | Contador de entregas + dead-letter | `test_poison_message_goes_to_dead_letter_after_max_deliveries` |
| 6 | Cache servindo dado velho depois de um write | Invalidação **após** o commit + namespace versionado | `test_catalog_cache_is_invalidated_after_writes` |
| 7 | Cache stampede quando uma chave quente expira | Single-flight com `SET NX PX` | (coberto por design; ver código) |
| 8 | Dois admins "iniciais" criados ao mesmo tempo | `pg_advisory_xact_lock` | `test_bootstrap_admin_works_exactly_once` |
| 9 | Dois abas renovando a sessão ao mesmo tempo | Janela de graça na rotação do refresh token | `test_concurrent_refresh_from_two_tabs_does_not_log_the_user_out` |
| 10 | Usuário desativado continua usando o JWT válido | Status em cache invalidado na mudança | `test_deactivation_takes_effect_immediately` |
| 11 | Várias réplicas do worker processando a mesma linha | `FOR UPDATE SKIP LOCKED` / consumer groups / advisory lock | (design; seguro com N réplicas) |
| 12 | Refresh em andamento sobrevive à troca de senha | advisory lock **por usuário** em refresh, login, logout, troca de senha e desativação | `test_refresh_in_flight_does_not_survive_a_password_change` |
| 13 | Leitura antiga recoloca "ativo" no cache depois da desativação | *tombstone* + escrita condicional em Lua | `test_deactivation_cannot_be_overwritten_by_a_stale_cache_write` |
| 14 | 30 tentativas de senha simultâneas furam o limite de 3 | reserva atômica da tentativa (devolvida no sucesso) | `test_concurrent_wrong_passwords_cannot_beat_the_account_limit` |
| 15 | Queda de 2 min do Postgres manda eventos para a DLQ | erro transitório ≠ mensagem venenosa (não conta tentativa) | `test_infrastructure_failures_never_dead_letter_events` |
| 16 | `LISTEN` cai e o relay fica surdo para sempre | *termination listener* + health check + reconexão | `test_relay_reconnects_listen_after_the_connection_drops` |

As linhas 12–16 só aparecem sob concorrência real, queda de infraestrutura ou entrada hostil: cada
uma foi reproduzida, corrigida e transformada em teste de regressão (`tests/integration/test_hardening.py`).
A [seção 10](#10-falhas-que-o-caminho-feliz-não-mostra) resume a lição.

---

## 1. Idempotência na criação de pedidos

**Cenário:** o app envia `POST /orders`, a resposta se perde num túnel 4G, o app reenvia. Sem
proteção, nascem dois pedidos e o cliente paga duas vezes.

**Contrato:** o cliente gera um UUID por **intenção de compra** e o envia em `Idempotency-Key`. Se
repetir a requisição com a mesma chave, recebe o mesmo pedido (`200` + `Idempotent-Replayed: true`)
em vez de criar outro (`201`).

```mermaid
sequenceDiagram
    autonumber
    participant A as Cliente (req A)
    participant B as Cliente (req B, retry)
    participant API
    participant PG as PostgreSQL
    A->>API: POST /orders (key=K)
    API->>PG: BEGIN; INSERT idempotency_keys(user,K,hash) ON CONFLICT DO NOTHING
    PG-->>API: 1 linha (A é dona da chave)
    B->>API: POST /orders (key=K)
    API->>PG: BEGIN; INSERT idempotency_keys(user,K,hash) ON CONFLICT DO NOTHING
    Note over PG: B BLOQUEIA no índice único<br/>até a transação de A terminar
    API->>PG: (A) INSERT orders, items, tracking, outbox; UPDATE idempotency_keys SET order_id
    API->>PG: (A) COMMIT
    PG-->>API: (B) 0 linhas (conflito)
    API->>PG: (B) SELECT idempotency_keys WHERE user,K
    API-->>A: 201 Created {id: 42}
    API-->>B: 200 OK {id: 42} + Idempotent-Replayed: true
```

Pontos importantes do desenho:

- **Por que no Postgres e não no Redis?** A chave e o pedido são gravados na **mesma transação**.
  Se o pedido sofrer rollback (produto esgotou), a chave também sofre, e um retry pode criar o pedido
  depois. Com Redis, existiria uma janela de inconsistência entre os dois sistemas.
- **O índice único é o lock.** Postgres faz *speculative insertion*: o segundo `INSERT` espera a
  transação que inseriu a mesma chave. Não há `SELECT … FOR UPDATE` manual nem lock distribuído.
- **Mesma chave, payload diferente → `422 idempotency_key_mismatch`.** O hash SHA-256 do payload
  canônico impede que um bug no cliente reutilize a chave para outra compra.
- **Escopo por usuário:** `UNIQUE (user_id, key)`, assim a chave de um cliente nunca colide com a de
  outro.
- **TTL de 24 h:** o worker apaga chaves antigas. Retries legítimos acontecem em segundos ou minutos.

Implementação: `app/modules/ordering/service.py` (`create`, `_replay`) e
`app/modules/ordering/repository.py` (`IdempotencyRepository.claim`).

## 2. Transições de status concorrentes

**Cenário:** o atendente A clica "confirmar" e o atendente B clica "cancelar" no mesmo milissegundo.
Os dois leem `status = created`, os dois acham a transição válida, e os dois gravam. O pedido termina
com dois eventos de tracking contraditórios e o cliente recebe duas notificações.

**Solução: lock pessimista de linha.**

```python
order = await session.execute(select(Order).where(Order.id == order_id).with_for_update())
domain.ensure_transition(order.status, target, actor, order.customer_id)  # revalida com o status atual
```

A segunda transação espera o `COMMIT` da primeira e então lê o status **novo**. O resultado é sempre
uma história serial válida: ou `created → confirmed → canceled` (as duas valem, já que cancelar a
partir de confirmado é permitido) ou uma delas recebe `409 invalid_transition`. O teste aceita
exatamente esses dois desfechos.

**Por que pessimista e não otimista (coluna `version`)?** Disputa no mesmo pedido é rara, mas, quando
acontece, o lock pessimista dá a resposta certa sem retry no cliente. O lock dura o tempo de uma
transação curta (~5 ms). Locking otimista (`UPDATE … WHERE version = $v`) faz mais sentido quando a
transação inclui tempo humano (um formulário aberto por minutos). Os dois são citados no ADR-0006.

**Cuidado clássico:** `FOR UPDATE` com `JOIN`/`joinedload` falha no Postgres ("FOR UPDATE cannot be
applied to the nullable side of an outer join"). Por isso o repositório trava só a linha de `orders`
e carrega os itens depois, com `selectinload`.

## 3. O problema do dual write e o transactional outbox

**Cenário:** depois de salvar o pedido, a API precisa avisar o cliente (notificação), o painel da
cozinha (tempo real) e, no futuro, cobrança e entregadores.

```python
await session.commit()          # 1. pedido salvo
await broker.publish(event)     # 2. o processo morre aqui -> ninguém fica sabendo do pedido
```

Inverter a ordem também não resolve: publicar antes e o commit falhar gera um evento sobre um pedido
que não existe.

**Solução:** gravar o evento numa tabela (`outbox_events`) **na mesma transação** do pedido. Um
processo separado (relay) lê a tabela e publica no broker.

```mermaid
sequenceDiagram
    autonumber
    participant API
    participant PG as PostgreSQL
    participant W as Worker (relay)
    participant RS as Redis Stream lux:events
    participant N as consumer "notifications"
    participant RT as consumer "realtime"
    participant SSE as API (SSE) -> browser
    API->>PG: BEGIN; INSERT orders...; INSERT outbox_events; SELECT pg_notify('lux_outbox'); COMMIT
    PG-->>W: NOTIFY (entregue só após o COMMIT)
    W->>PG: SELECT ... WHERE published_at IS NULL FOR UPDATE SKIP LOCKED LIMIT 100
    W->>RS: XADD (pipeline)
    W->>PG: UPDATE published_at = now(); COMMIT
    RS-->>N: XREADGROUP (grupo notifications)
    N->>PG: INSERT notifications ON CONFLICT (source_event_id) DO NOTHING
    N->>SSE: PUBLISH lux:rt:user:{id} "notification.created"
    RS-->>RT: XREADGROUP (grupo realtime)
    RT->>SSE: PUBLISH lux:rt:user:{id} / lux:rt:role:admin "order.updated"
```

Detalhes de engenharia:

| Decisão | Motivo |
|---|---|
| `pg_notify` dentro da transação | O NOTIFY só é entregue se a transação comitar; o relay acorda em milissegundos e o polling (1 s) vira apenas fallback. Medido: da resposta do `POST /orders` ao evento no stream, p50 de 20 ms e p95 de 27 ms; até a notificação gravada, p50 de 32 ms. Um teste garante a entrega mesmo com polling de 30 s. |
| `FOR UPDATE SKIP LOCKED` | Várias réplicas do relay dividem o trabalho sem publicar a mesma linha duas vezes e sem esperar umas pelas outras. |
| `XADD` antes de marcar `published_at`, dentro da transação | Se o Redis falhar, rollback e retry. Se o commit falhar depois do `XADD`, o evento sai duplicado: aceitável, porque todo consumer é idempotente. |
| Índice parcial `WHERE published_at IS NULL` | A varredura do relay é O(pendentes), não O(histórico). |
| Worker conecta direto no Postgres, não pelo PgBouncer | `LISTEN` precisa de conexão de sessão; *transaction pooling* não oferece isso. |

**Garantia resultante:** *at-least-once* do banco até os consumers, e efeito *exactly-once* nos
consumers por idempotência. Exactly-once de ponta a ponta sem coordenação não existe. O que dá para
garantir é entrega pelo menos uma vez com processamento idempotente.

**Ordenação:** dentro de uma réplica do relay, os eventos saem em ordem de `id`. Com várias réplicas
e `SKIP LOCKED`, dois lotes podem se intercalar. Para notificações isso é aceitável (cada uma é
independente e o REST é a fonte da verdade). Se fosse necessária ordem estrita por pedido, o caminho
seria particionar por `aggregate_id`, como o Kafka faz com a chave de partição.

## 4. Consumers idempotentes e mensagens venenosas

Redis Streams com **consumer groups** dá *fan-out* durável: o grupo `notifications` e o grupo
`realtime` leem o mesmo stream, cada um com seu offset. Dentro de um grupo, as mensagens se dividem
entre as réplicas do worker.

- Mensagem processada → `XACK`.
- O handler falhou → a mensagem fica na PEL (Pending Entries List). Depois de 30 s ociosa,
  `XAUTOCLAIM` a entrega de novo, inclusive para outra réplica (que sobrevive ao crash de um worker).
- Falhou `CONSUMER_MAX_DELIVERIES` vezes (5) → vai para `lux:events:dlq` com o erro e recebe `XACK`.
  Uma mensagem com bug não bloqueia as outras para sempre. O alerta `DeadLetterGrowing` avisa o time.

**Por que Redis Streams e não Kafka/RabbitMQ?** O Redis já está na stack (cache, rate limit), e Streams
oferece consumer groups, ack, reentrega e retenção com `MAXLEN`. Para o volume deste sistema (dezenas
de eventos por segundo no pico do estágio 4), introduzir Kafka seria custo operacional sem benefício.
O ADR-0004 lista o gatilho para migrar: retenção longa (replay de dias), muitos consumidores
independentes ou throughput acima de ~50k eventos/s.

## 5. Cache sem servir dado velho

```python
await session.commit()
await cache.invalidate_namespace("catalog")   # depois do commit, nunca antes
```

Invalidar **antes** do commit cria uma janela em que um leitor concorrente acha o cache vazio, lê o
banco (ainda com o valor antigo, porque a transação não comitou) e **repopula o cache com o dado
velho**, que fica lá até o TTL.

**Namespace versionado:** em vez de `SCAN lux:catalog:* + DEL` (O(N) no keyspace e com corrida contra
escritores), toda chave inclui a versão do namespace (`lux:cache:catalog:v17:products:…`). Invalidar é
um `INCR` (O(1)); as chaves antigas simplesmente deixam de ser lidas e expiram pelo TTL.

**Stampede:** quando a chave do cardápio expira no pico do almoço, 500 requisições simultâneas iriam
ao banco. Com *single-flight*, só quem ganha um `SET lock NX PX 3000` consulta o Postgres; as demais
esperam até ~1 s pelo valor e, no pior caso, vão ao banco. O lock é liberado com um script Lua que
confere o token, para não apagar o lock de outro processo.

**Fail-open:** se o Redis cair, `cached()` chama o loader direto. Cache é otimização, não dependência.

**O que *não* é cacheado:** a lista de pedidos de cada cliente. Ela é por usuário, muda a cada
transição e já é servida por um índice em ~1 ms. A versão anterior cacheava essa lista e invalidava
de forma inconsistente (a chave ignorava a paginação). A regra adotada: cachear o que é **lido
muito, compartilhado e muda pouco** (cardápio, analytics).

## 6. Locks consultivos (advisory locks)

Usados onde não existe uma linha natural para travar:

| Lock | Onde | Por quê |
|---|---|---|
| `pg_advisory_xact_lock(824311)` | bootstrap do primeiro admin | dois requests simultâneos não podem criar dois "primeiros" admins |
| `pg_try_advisory_xact_lock(824312)` | manutenção do worker | com N réplicas, só uma faz a limpeza em cada ciclo; as outras pulam sem esperar |

A variante `_xact_` libera o lock automaticamente no fim da transação, então não há como "esquecer"
um lock em caso de exceção.

## 7. Sessões: rotação de refresh token, roubo e duas abas

- Cada `POST /auth/refresh` **rotaciona** o refresh token: o antigo é revogado e aponta para o novo
  (`replaced_by_jti_hash`).
- Se um token **já rotacionado** for apresentado de novo, alguém tem uma cópia dele: a família inteira
  é revogada e os dois lados (usuário e atacante) precisam logar de novo (OAuth 2.0 Security BCP).
- **Exceção de usabilidade:** duas abas do navegador podem renovar ao mesmo tempo. Dentro de uma janela
  de 10 s (`REFRESH_REUSE_GRACE_SECONDS`), o reuso de um token recém-rotacionado devolve
  `401 refresh_token_rotated` **sem** derrubar a família. O cookie novo já está no navegador, e o front
  simplesmente repete a request.
- O `SELECT … FOR UPDATE` na linha do token serializa dois refreshes do mesmo token.

## 8. Efeito imediato de desativação e mudança de papel

Um JWT de acesso vale por 15 minutos. Sem nenhuma checagem extra, um usuário desativado continuaria
operando por até 15 minutos. Toda request autenticada consulta `(is_active, role)` num cache Redis
(TTL 5 min) que é **apagado** quando o admin desativa o usuário ou muda o papel. A desativação também
revoga todos os refresh tokens. O papel efetivo vem desse status, não do JWT, então um rebaixamento
vale imediatamente.

Trade-off: uma ida ao Redis por request (~0,2 ms). A alternativa, um JWT de 1 minuto, multiplicaria o
tráfego de refresh e a carga de bcrypt.

## 9. Sessões sob concorrência: um lock por usuário

Três operações mexem nas sessões de um usuário ao mesmo tempo: **refresh** (insere um token novo),
**revogação em massa** (troca de senha, desativação, logout) e **login**. Um `UPDATE … SET revoked_at
WHERE user_id = X` não enxerga a linha que um refresh concorrente inseriu e ainda não comitou, então
essa sessão sobrevive à troca de senha. A correção serializa tudo que mexe nas sessões de um usuário:

```python
await session.execute(text("SELECT pg_advisory_xact_lock(:cls, :uid)"), {"cls": 824313, "uid": user_id})
```

O lock é por usuário (usuários diferentes não se bloqueiam), dura uma transação curta e é liberado
sozinho no commit. O login faz o bcrypt **fora** dessa transação e, já com o lock, confere de novo se o
hash da senha ainda é o mesmo que acabou de validar.

## 10. Falhas que o caminho feliz não mostra

Com a suíte verde e os testes de carga feitos, ainda havia 12 problemas, 11 deles reproduzíveis com
scripts. Quatro eram de concorrência (tabela acima), três
na migration (dados reais da v2 abortavam ou mudavam valores, ver [03 §9](03-modelagem-de-dados.md#9-evolução-do-schema-migrations)),
e os demais eram de robustez (500 em vez de 4xx, bcrypt segurando conexão, bypass do rate limit pelo
header `Host`). A lição: **teste verde prova o que você pensou em testar.** Scripts de concorrência,
dados com o formato de produção e entradas hostis procuram o que você não pensou.

## 11. Por que não transações distribuídas (2PC)?

Hoje tudo que precisa ser atômico está no mesmo Postgres. Quando os domínios forem separados em
bancos diferentes (estágio 6), uma operação que cruza domínios (por exemplo, "criar pedido + reservar
estoque + cobrar") vira uma **saga**: uma sequência de transações locais ligadas por eventos do
outbox, cada uma com uma ação compensatória ("estornar cobrança", "liberar estoque"). O outbox e os
consumers idempotentes deste projeto já são as peças básicas de uma saga coreografada. Detalhes em
[08 — Federação](08-federacao-sharding-e-microservicos.md#4-sagas-em-vez-de-2pc).
