# Lux Delivery API

**API REST completa para gerenciamento de delivery — pedidos, clientes e administração**

[![Python](https://img.shields.io/badge/Python-3.11+-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue)](https://docker.com)

---

## Sobre o Projeto

A **Lux Delivery API** é uma API REST construída com **FastAPI** que simula o backend completo de uma plataforma de delivery. Desenvolvida com foco em autenticação segura, arquitetura em camadas, cache, rate limiting e containerização.

---

## Stack

| Tecnologia | Uso |
|---|---|
| **FastAPI** | Framework web assíncrono |
| **PostgreSQL 16** | Banco de dados principal |
| **Redis 7** | Cache e rate limiting |
| **SQLAlchemy 2** | ORM async |
| **Alembic** | Migrations de banco |
| **Pydantic V2** | Validação de dados |
| **PyJWT** | Geração e validação de JWT |
| **Supabase** | Storage de imagens |
| **Docker + Compose** | Containerização e orquestração |

---

## Destaques Técnicos

- **Autenticação JWT** com access token (HttpOnly cookie) + refresh token rotativo com detecção de reutilização
- **JTI hasheado com SHA-256** — o token bruto nunca é armazenado no banco
- **2 roles** com permissões distintas: `admin` e `customer`
- **Rate limiting global** com Redis (sliding window) — por IP e por usuário autenticado
- **Rate limiting extra** nas rotas de auth (login/refresh/bootstrap)
- **Cache Redis** nas rotas de produtos, categorias e pedidos — com graceful degradation
- **Rastreamento de pedidos** com histórico completo de status e timestamps
- **Sistema de notificações** por evento
- **Analytics** de pedidos por período para administradores
- **Upload de imagens** com validação de MIME type, magic bytes e conversão automática para WebP
- **Deploy containerizado** com Docker multi-stage build e usuário não-root

---

## Autenticação

O sistema usa dois tokens JWT enviados como **cookies HttpOnly** (não headers):

- **Access token** — curta duração (30 min), cookie `access_token` com `path=/`
- **Refresh token** — longa duração (7 dias), cookie `refresh_token` com `path=/auth`

> A autenticação é baseada em **cookies**, não em header `Authorization: Bearer`.
> Em desenvolvimento (HTTP), os cookies trafegam normalmente (`secure=False`).
> Em produção (HTTPS), os cookies são marcados como `secure=True` automaticamente via `ENV=production`.

Se um refresh token já usado for apresentado novamente, a requisição é rejeitada (401) — detecção de reutilização ativa.

---

## Endpoints

### Auth
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| `POST` | `/auth/register` | Cadastro de usuário | Público |
| `POST` | `/auth/login` | Login — seta cookies de auth | Público |
| `POST` | `/auth/token` | OAuth2 login (password grant) | Público |
| `POST` | `/auth/refresh` | Renova tokens | Público |
| `POST` | `/auth/logout` | Logout — limpa cookies | Público |
| `GET` | `/auth/me` | Dados do usuário autenticado | Autenticado |
| `POST` | `/auth/bootstrap-admin` | Cria o primeiro admin | Token especial |

### Usuários
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| `GET` | `/users/` | Lista todos os usuários | Admin |
| `POST` | `/users/` | Cria usuário com role | Admin |
| `GET` | `/users/me` | Perfil do usuário atual | Autenticado |
| `PATCH` | `/users/me` | Atualiza nome, telefone ou senha | Autenticado |
| `PATCH` | `/users/{id}/deactivate` | Desativa usuário | Admin |
| `PATCH` | `/users/{id}/activate` | Ativa usuário | Admin |

### Produtos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| `GET` | `/products/` | Lista produtos (paginação por cursor) | Público |
| `GET` | `/products/{id}` | Detalhes do produto | Público |
| `POST` | `/products/` | Cria produto | Admin |
| `PATCH` | `/products/{id}` | Atualiza produto | Admin |
| `DELETE` | `/products/{id}` | Remove produto | Admin |
| `POST` | `/products/{id}/image` | Upload de imagem | Admin |

### Categorias
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| `GET` | `/categories/` | Lista categorias (cached) | Público |
| `POST` | `/categories/` | Cria categoria | Admin |
| `PATCH` | `/categories/{id}` | Atualiza categoria | Admin |
| `DELETE` | `/categories/{id}` | Remove categoria | Admin |

### Pedidos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| `POST` | `/orders/` | Cria pedido | Customer/Admin |
| `GET` | `/orders/` | Lista pedidos do usuário | Autenticado |
| `GET` | `/orders/{id}` | Detalhes do pedido | Autenticado |
| `PATCH` | `/orders/{id}/status` | Atualiza status | Autenticado |
| `GET` | `/orders/{id}/tracking` | Histórico de rastreamento | Autenticado |

### Notificações
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| `GET` | `/notifications/` | Lista notificações do usuário | Autenticado |
| `PATCH` | `/notifications/{id}/read` | Marca como lida | Autenticado |

### Analytics
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| `GET` | `/analytics/orders-progress` | Métricas de pedidos por período | Admin |

---

## Fluxo de Status do Pedido

```
CREATED → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → DELIVERED
   ↓           ↓           ↓               ↓
CANCELED    CANCELED    CANCELED        CANCELED
```

Cada transição gera um evento de rastreamento e uma notificação para o cliente.

---

## Arquitetura

```
app/
├── auth/               # JWT, dependências, rate limiting de auth
├── core/               # Redis client
├── middleware/         # Rate limit global, security headers
├── models/             # Models SQLAlchemy (User, Order, Product...)
├── repositories/       # Camada de acesso ao banco
├── services/           # Regras de negócio
├── routers/            # Endpoints FastAPI
├── schemas/            # Schemas Pydantic (input/output)
├── config.py           # Settings via pydantic-settings
├── database.py         # Engine e sessão async
└── main.py             # App FastAPI, lifespan, routers
```

---

## Rodando com Docker

**Pré-requisitos:** Docker e Docker Compose instalados.

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/lux-delivery.git
cd lux-delivery

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# 3. Suba os serviços (migrations rodam automaticamente)
docker compose up --build -d

# 4. Acesse
# API:     http://localhost:8000
# Swagger: http://localhost:8000/docs  (apenas ENV=development)
```

---

## Rodando Localmente (sem Docker)

```bash
# 1. Crie o ambiente virtual
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows

# 2. Instale as dependências
pip install -r requirements.txt

# 3. Configure o .env
cp .env.example .env

# 4. Rode as migrations
alembic upgrade head

# 5. Inicie a API
uvicorn app.main:app --reload
```

> PostgreSQL e Redis precisam estar rodando localmente.

---

## Variáveis de Ambiente

Crie um `.env` baseado no `.env.example`:

```env
# Banco de dados
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/lux_delivery
POSTGRES_USER=user
POSTGRES_PASSWORD=strong_password
POSTGRES_DB=lux_delivery

# Redis
REDIS_URL=redis://:password@localhost:6379/0
REDIS_PASSWORD=strong_redis_password

# JWT
SECRET_KEY=sua_chave_secreta_jwt_com_pelo_menos_32_caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Bootstrap admin (mínimo 32 caracteres)
BOOTSTRAP_ADMIN_TOKEN=token_seguro_para_criar_primeiro_admin_32chars

# Rate limiting
AUTH_RATE_LIMIT_MAX_ATTEMPTS=10
AUTH_RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX_PER_IP=120
RATE_LIMIT_MAX_PER_USER=300

# Paginação e analytics
PRODUCTS_MAX_PAGE_SIZE=100
ANALYTICS_MAX_RANGE_DAYS=93

# Cache TTLs (segundos)
TTL_PRODUCTS_LIST=300
TTL_CATEGORIES=600
TTL_ORDERS_LIST=60
TTL_USER=1800

# Upload
MAX_UPLOAD_SIZE=5242880
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp,image/gif

# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua_chave_supabase
SUPABASE_BUCKET=products

# CORS e proxy
CORS_ORIGINS=["http://localhost:3000"]
TRUSTED_PROXIES=["127.0.0.1"]

# Ambiente
ENV=development
```

---

## Segurança

- Usuário não-root no container Docker
- Multi-stage build (imagem final sem ferramentas de build)
- Redis protegido com senha
- Banco e Redis sem portas expostas ao host em produção
- Rate limiting global (IP + usuário) via Redis + limiter extra nas rotas de auth
- Refresh tokens com rotação e detecção de reutilização — JTI hasheado com SHA-256
- Cookies HttpOnly + SameSite=Strict + Secure em produção
- Senhas com bcrypt + validação de força (maiúscula, minúscula, número, especial, mín. 10 chars)
- Mass-assignment protection via `_UPDATABLE_FIELDS` em todos os repositórios
- Magic bytes validation no upload de imagens
- Swagger/ReDoc desabilitados em produção
- Security headers (X-Frame-Options, nosniff, HSTS, Referrer-Policy, Permissions-Policy)
- `pg_advisory_xact_lock` no bootstrap admin para evitar race condition

---

## Licença

Distribuído sob a licença MIT.
