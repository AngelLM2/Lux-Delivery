# 11 — Backend Architecture & Implementation Deep-Dive

Este documento detalha o design técnico, padrões de persistência, modelo de concorrência e estratégias de entrega de eventos implementados na camada de **Backend (FastAPI Modular Monolith)** do Lux Delivery.

---

## 1. Visão Geral da Arquitetura do Backend

O backend foi projetado como um **monólito modular** orientado a domínios (Bounded Contexts) com separação rígida de responsabilidades:

```
[ HTTP Request (FastAPI / ASGI) ]
             |
             v
   +-------------------+
   | Pure ASGI Pipeline| (Request ID, Timing, Exception Handling, CORS)
   +-------------------+
             |
             v
   +-------------------+
   | Router Layer      | (Validação Pydantic, Injeção de Dependências Principal)
   +-------------------+
             |
             v
   +-------------------+
   | Service Layer     | (Orquestração de Regras de Negócio, Transações ACID, Idempotência)
   +-------------------+
             |
      +------+------+
      |             |
      v             v
+-----------+ +-----------+
| Domain    | | Repository| (Queries otimizadas SQLAlchemy 2 asyncpg)
| (Pure Ent)| | Layer     |
+-----------+ +-----------+
      |             |
      +------+------+
             |
             v
+-----------------------------+
| PostgreSQL (ACID)           |
| - Tabela de Negócio         |
| - outbox_events             |
| - pg_notify(lux_outbox)     |
+-----------------------------+
             |
             v (Assíncrono via LISTEN / NOTIFY)
+-----------------------------+
| Worker: outbox_relay        |
| - SELECT ... SKIP LOCKED    |
| - Redis Stream XADD         |
+-----------------------------+
```

### 1.1 Camadas do Bounded Context
Cada módulo em `app/modules/<context>/` é estritamente isolado:
- `domain.py`: Funções e tipos puros sem dependências de framework ou I/O (máquina de estados, fusão de itens, cálculos de total).
- `models.py`: Mapeamento relacional SQLAlchemy 2.0 com tipagem estrita `Mapped[...]`.
- `schemas.py`: Contratos de entrada e saída Pydantic v2.
- `repository.py`: Acesso a dados isolado com queries parametrizadas.
- `service.py`: Coordenação transacional, idempotência e geração de eventos de outbox.
- `router.py`: Endpoints REST desacoplados.

---

## 2. Padrão Transactional Outbox (PostgreSQL + Redis Streams)

Para evitar inconsistências distribuídas (dual-write problem entre banco relacional e mensageria), nenhum evento é publicado diretamente no Redis durante a requisição HTTP.

### 2.1 Enfileiramento Atômico (`app.core.outbox`)
1. Dentro da mesma transação do banco (`session.commit()`):
   - A alteração de negócio (ex: criação do pedido) é inserida.
   - O registro correspondente é inserido na tabela `outbox_events` com `published_at = NULL`.
   - Um comando SQL `SELECT pg_notify('lux_outbox', '')` é executado na sessão.
2. Como o `pg_notify` é transacional no PostgreSQL, a notificação só é emitida aos ouvintes após a transação ser confirmada com sucesso (garantia de consistência).

### 2.2 Relay Concorrente com `SKIP LOCKED` (`app.workers.outbox_relay`)
O worker de relay processa lotes sem gargalo de contenção:
```sql
SELECT * FROM outbox_events
WHERE published_at IS NULL
ORDER BY id
LIMIT :batch_size
FOR UPDATE SKIP LOCKED;
```
- **Concorrência Segura**: Múltiplas instâncias de workers podem rodar simultaneamente sem processar o mesmo lote.
- **At-Least-Once Delivery**: O comando `XADD` no Redis Stream ocorre antes do commit que atualiza `published_at = now()`. Se o worker falhar antes do commit, o evento será reprocessado; consumidores deduplicam via `event_id` (UUIDv4).

---

## 3. Garantias de Idempotência e Concorrência

### 3.1 Fingerprinting Canônico
Requisições de mutação crítica (como criação de pedidos) suportam o header `Idempotency-Key`:
1. Um hash SHA-256 canônico é calculado sobre a carga útil normalizada (`delivery_address`, `notes`, itens ordenados por `product_id`).
2. O repositório tenta obter o bloqueio de idempotência no banco via inserção única.
3. Se a chave já existir:
   - Hash idêntico e pedido concluído: executa **replay transparente** sem reprocessamento.
   - Hash diferente: rejeição com `422 UnprocessableEntity (idempotency_key_mismatch)`.
   - Processamento em andamento: resposta imediata `409 Conflict (idempotency_in_progress)`.

### 3.2 Proteção Anti-IDOR (Insecure Direct Object Reference)
Em endpoints protegidos como `/orders/{id}`:
- Quando um usuário não-admin tenta acessar um pedido pertencente a outro cliente, o sistema retorna **`404 Not Found`** em vez de `403 Forbidden`.
- **Racional de Segurança**: Impede enumeração maliciosa de IDs de pedidos existentes no sistema.

---

## 4. Paginação de Alto Desempenho (Keyset Pagination)

Em substituição à paginação tradicional por `OFFSET/LIMIT` (que degrada para $O(N)$ em tabelas volumosas), o backend utiliza paginação por cursor baseada em chaves ordenadas:
$$\text{WHERE } (created\_at, id) < (cursor.created\_at, cursor.id)$$
$$\text{ORDER BY } created\_at \text{ DESC}, id \text{ DESC LIMIT } :limit + 1$$
- O cursor é codificado em base64 URL-safe contendo timestamp e ID contíguo.
- Permite navegação estável sob inserções concorrentes sem saltos ou duplicatas.
