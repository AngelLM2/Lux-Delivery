# 04 — API

> Referência interativa: `http://localhost:8000/docs` (Swagger) ou `/redoc`, desligados em produção.
> Contrato versionado: `apps/web/openapi.json`, do qual os tipos TypeScript do front são **gerados**.
> O CI falha se o contrato e os tipos divergirem.

## 1. Convenções

### Versionamento
Tudo sob `/api/v1`. Mudanças compatíveis (campo novo opcional, endpoint novo) entram na v1. Mudanças
incompatíveis (remover ou renomear campo, mudar semântica) exigem `/api/v2` convivendo com a v1
durante a migração dos clientes. Infra fica fora do prefixo: `/health/live`, `/health/ready`, `/metrics`.

### Formato de erro (todas as respostas 4xx/5xx)
```json
{ "detail": "Pedido nao encontrado.", "code": "order_not_found", "request_id": "5f130b8d60ec4f72..." }
```
- `detail`: mensagem para humanos (pt-BR). Em `422` é a lista de erros por campo (`loc`, `msg`, `type`),
  que o front usa para marcar os campos do formulário.
- `code`: estável, para o código do cliente decidir o que fazer (`refresh_token_rotated` → repetir a
  requisição; `invalid_transition` → recarregar o quadro).
- `request_id`: o mesmo do header `X-Request-ID` e dos logs. Um print de erro já traz o id para busca.

| Status | Uso |
|---|---|
| 400 | requisição malformada para a regra (cursor inválido, período invertido, PATCH vazio) |
| 401 | sem sessão, sessão expirada ou revogada |
| 403 | autenticado mas sem permissão (papel ou regra de transição) |
| 404 | não existe **ou não é seu** (IDOR) |
| 409 | conflito de estado (e-mail já usado, transição inválida, nome de produto duplicado) |
| 413 / 415 | upload grande demais / não é imagem |
| 422 | validação de schema; regra de negócio sobre o conteúdo (produto indisponível, `Idempotency-Key` com outro payload) |
| 429 | rate limit (com `Retry-After`) |
| 503 | sobrecarga ou dependência fora (com `Retry-After`): pool de conexões esgotado, load shedding, Redis fora nas rotas de auth |

### Paginação: cursor opaco (keyset)
```http
GET /api/v1/orders?limit=20
→ { "items": [...], "next_cursor": "eyJjIjoiMjAyNi0xMC0wM1QxMjo..." }
GET /api/v1/orders?limit=20&cursor=eyJjIjoiMjAyNi0xMC0wM1QxMjo...
→ { "items": [...], "next_cursor": null }   # fim
```
O cursor é base64 de `{created_at, id}` do último item, e o cliente deve tratá-lo como opaco. Custo
constante por página (a condição vira limite do índice), sem itens duplicados ou pulados quando novos
pedidos chegam entre uma página e outra. Ver o `EXPLAIN` em [03](03-modelagem-de-dados.md#validando-com-explain-e-o-bug-que-ele-encontrou).

### Idempotência
`POST /api/v1/orders` aceita `Idempotency-Key: <uuid>`. A mesma chave com o mesmo corpo devolve o mesmo
pedido (`200` + `Idempotent-Replayed: true`); com outro corpo, `422 idempotency_key_mismatch`; com a
primeira requisição ainda em andamento, `409 idempotency_in_progress`. Escopo por usuário, validade de 24 h.
Detalhes em [06](06-concorrencia-e-consistencia.md#1-idempotência-na-criação-de-pedidos).

### Cache HTTP
`GET /products` e `GET /categories` respondem `Cache-Control: public, max-age=30,
stale-while-revalidate=120` (CDN-friendly). Respostas autenticadas não são cacheáveis.

### Rate limit
Global: 300 req/min por IP e 600 por usuário (janela deslizante). Rotas de credencial: 10/min por IP e
rota. Login: 10 **falhas** em 15 min **por conta** (logins bem-sucedidos não contam). Respostas `429` trazem `Retry-After`,
`X-RateLimit-Limit` e `X-RateLimit-Remaining`.

## 2. Endpoints

### Autenticação (`/api/v1/auth`)
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/register` | — | cria cliente (papel sempre `customer`) |
| POST | `/login` | — | define os cookies `lux_access`/`lux_refresh`; devolve `{user, access_expires_at}` |
| POST | `/token` | — | OAuth2 password flow (form): devolve Bearer para Swagger, k6 e scripts |
| POST | `/refresh` | cookie refresh | rotaciona o refresh e emite novo access |
| POST | `/logout` | — | revoga a família de refresh + denylist do access; limpa os cookies |
| GET | `/me` | sim | usuário atual |
| POST | `/bootstrap-admin` | header `X-Bootstrap-Token` | cria o **primeiro** admin (uma única vez) |

### Usuários (`/api/v1/users`)
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/` | admin | lista paginada; filtros `role`, `q` |
| POST | `/` | admin | cria usuário com papel |
| GET / PATCH | `/me` | sim | perfil; trocar a senha exige `current_password` e encerra as outras sessões |
| PATCH | `/{id}/activate`, `/{id}/deactivate` | admin | desativação com efeito imediato |

### Catálogo
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/categories` | — | lista ordenada por `position` (cacheada) |
| POST / PATCH / DELETE | `/categories[/{id}]` | admin | apagar categoria mantém os produtos (`category_id = null`) |
| GET | `/products` | — | página de produtos ativos; filtros `category_id`, `q`, `offers_only`, `highlights_only` (cacheada) |
| GET | `/products/admin` | admin | inclui arquivados; nunca cacheada |
| GET | `/products/{id}` | — | detalhe (404 se arquivado) |
| POST / PATCH | `/products[/{id}]` | admin | PATCH altera só os campos enviados |
| DELETE | `/products/{id}` | admin | **arquiva** (soft delete) |
| POST | `/products/{id}/restore` | admin | desarquiva (409 se o nome já foi reutilizado) |
| POST | `/products/{id}/image` | admin | multipart `file`; converte para WebP ≤ 1200 px |

### Pedidos (`/api/v1/orders`)
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/` | cliente/admin | cria pedido (`Idempotency-Key` recomendado) |
| GET | `/` | sim | cliente: os seus; admin: todos (`status`, `mine`, cursor) |
| GET | `/{id}` | dono/admin | pedido com itens e linha do tempo |
| GET | `/{id}/tracking` | dono/admin | só a linha do tempo |
| PATCH | `/{id}/status` | dono (só cancelar até `confirmed`) / admin | `{status, description?}` |

### Notificações (`/api/v1/notifications`)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | paginada; `only_unread` |
| GET | `/unread-count` | `{unread}` (badge do sino) |
| PATCH | `/{id}/read` | marca uma como lida |
| POST | `/read-all` | marca todas; devolve `{updated}` |

### Analytics (`/api/v1/analytics`), só admin
`GET /orders?start_date&end_date` (padrão: últimos 30 dias, máximo 366) devolve totais, receita,
ticket médio, taxa de cancelamento, p50/p90/média de cada etapa, contagem por status, série diária
(dias sem pedido aparecem com zero) e top 5 produtos. Calculado em SQL, servido pela réplica de leitura
quando configurada, cache de 60 s.

### Tempo real
`GET /api/v1/events/stream`: Server-Sent Events, autenticado pelo cookie.

| Evento | Para quem | `data` |
|---|---|---|
| `ready` | todos | `{channels}` (conexão estabelecida) |
| `order.updated` | dono do pedido (e admins) | `{order_id, status, previous_status, event_id}` |
| `order.created` | admins | `{order_id, status, total_amount}` |
| `notification.created` | dono | `NotificationRead` |

O servidor envia `: keep-alive` a cada 15 s e encerra o stream quando o access token expira. O cliente
renova a sessão e reconecta com backoff exponencial. Eventos são **dicas**: o cliente reconsulta o
REST, que é a fonte da verdade.

### Infra
| Rota | Descrição |
|---|---|
| `GET /health/live` | o processo está vivo (não toca dependências) |
| `GET /health/ready` | banco, Redis e versão da migration ok; 503 caso contrário |
| `GET /metrics` | Prometheus (opcionalmente protegido por `METRICS_TOKEN`); não exposto pelo nginx público |
