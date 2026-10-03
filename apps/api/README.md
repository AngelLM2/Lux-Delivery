# Lux Delivery API

**Full-featured REST API for delivery management — orders, customers and administration**

[![Python](https://img.shields.io/badge/Python-3.11+-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue)](https://docker.com)

---

## About the Project

The **Lux Delivery API** is a REST API built with **FastAPI** that simulates the complete backend of a delivery platform. Developed with a focus on secure authentication, layered architecture, caching, rate limiting and containerization.

---

## Stack

| Technology | Purpose |
|---|---|
| **FastAPI** | Async web framework |
| **PostgreSQL 16** | Main database |
| **Redis 7** | Cache and rate limiting |
| **SQLAlchemy 2** | Async ORM |
| **Alembic** | Database migrations |
| **Pydantic V2** | Data validation |
| **PyJWT** | JWT generation and validation |
| **Supabase** | Image storage |
| **Docker + Compose** | Containerization and orchestration |

---

## Technical Highlights

- **JWT authentication** with access token (HttpOnly cookie) + rotating refresh token with reuse detection
- **SHA-256 hashed JTI** — raw refresh token is never stored in the database
- **2 roles** with distinct permissions: `admin` and `customer`
- **Global rate limiting** with Redis (sliding window) — per IP and authenticated user
- **Extra auth rate limiting** on login/refresh/bootstrap routes
- **Redis cache** on products, categories and orders — with graceful degradation
- **Order tracking** with full status history and timestamps
- **Notification system** per event (creation, status updates)
- **Order analytics** by period for administrators
- **Image upload** with MIME type validation, magic bytes and automatic WebP conversion
- **Containerized deployment** with Docker multi-stage build and non-root user

---

## Authentication

The system uses two JWT tokens sent as **HttpOnly cookies** (not headers):

- **Access token** — short-lived (30 min), `access_token` cookie with `path=/`
- **Refresh token** — long-lived (7 days), `refresh_token` cookie with `path=/auth`

> Authentication is **cookie-based**, not `Authorization: Bearer` header.
> In development (HTTP), cookies work normally (`secure=False`).
> In production (HTTPS), cookies are automatically marked as `secure=True` via `ENV=production`.

If a previously used refresh token is presented again, the request is rejected (401) — active reuse detection.

---

## Endpoints

### Auth
| Method | Route | Description | Auth |
|---|---|---|---|
| `POST` | `/auth/register` | Register new user | Public |
| `POST` | `/auth/login` | Login — sets auth cookies | Public |
| `POST` | `/auth/token` | OAuth2 login (password grant) | Public |
| `POST` | `/auth/refresh` | Rotate tokens | Public |
| `POST` | `/auth/logout` | Logout — clears cookies | Public |
| `GET` | `/auth/me` | Authenticated user data | Authenticated |
| `POST` | `/auth/bootstrap-admin` | Create first admin | Bootstrap token |

### Users
| Method | Route | Description | Auth |
|---|---|---|---|
| `GET` | `/users/` | List all users | Admin |
| `POST` | `/users/` | Create user with role | Admin |
| `GET` | `/users/me` | Current user profile | Authenticated |
| `PATCH` | `/users/me` | Update name, phone or password | Authenticated |
| `PATCH` | `/users/{id}/deactivate` | Deactivate user | Admin |
| `PATCH` | `/users/{id}/activate` | Activate user | Admin |

### Products
| Method | Route | Description | Auth |
|---|---|---|---|
| `GET` | `/products/` | List products (cursor pagination) | Public |
| `GET` | `/products/{id}` | Product details | Public |
| `POST` | `/products/` | Create product | Admin |
| `PATCH` | `/products/{id}` | Update product | Admin |
| `DELETE` | `/products/{id}` | Delete product | Admin |
| `POST` | `/products/{id}/image` | Upload product image | Admin |

### Categories
| Method | Route | Description | Auth |
|---|---|---|---|
| `GET` | `/categories/` | List categories (cached) | Public |
| `POST` | `/categories/` | Create category | Admin |
| `PATCH` | `/categories/{id}` | Update category | Admin |
| `DELETE` | `/categories/{id}` | Delete category | Admin |

### Orders
| Method | Route | Description | Auth |
|---|---|---|---|
| `POST` | `/orders/` | Create order | Customer/Admin |
| `GET` | `/orders/` | List user orders | Authenticated |
| `GET` | `/orders/{id}` | Order details | Authenticated |
| `PATCH` | `/orders/{id}/status` | Update status (admin full, customer cancel) | Authenticated |
| `GET` | `/orders/{id}/tracking` | Tracking history | Authenticated |

### Notifications
| Method | Route | Description | Auth |
|---|---|---|---|
| `GET` | `/notifications/` | List user notifications | Authenticated |
| `PATCH` | `/notifications/{id}/read` | Mark as read | Authenticated |

### Analytics
| Method | Route | Description | Auth |
|---|---|---|---|
| `GET` | `/analytics/orders-progress` | Order metrics by period | Admin |

---

## Order Status Flow

```
CREATED → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → DELIVERED
   ↓           ↓           ↓               ↓
CANCELED    CANCELED    CANCELED        CANCELED
```

Each transition generates a tracking event and a notification for the customer.

---

## Architecture

```
app/
├── auth/               # JWT, auth dependencies, auth rate limiting
├── core/               # Redis client
├── middleware/         # Global rate limit, security headers
├── models/             # SQLAlchemy ORM (User, Order, Product...)
├── repositories/       # Database access layer
├── services/           # Business logic
├── routers/            # FastAPI endpoints
├── schemas/            # Pydantic schemas (input/output)
├── config.py           # Settings via pydantic-settings
├── database.py         # Async engine and session
└── main.py             # FastAPI app, lifespan, routers
```

---

## Running with Docker

**Requirements:** Docker and Docker Compose installed.

```bash
# 1. Clone the repository
git clone https://github.com/your-username/lux-delivery.git
cd lux-delivery

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your settings

# 3. Start all services (migrations run automatically)
docker compose up --build -d

# 4. Access
# API:     http://localhost:8000
# Swagger: http://localhost:8000/docs  (only with ENV=development)
```

---

## Running Locally (without Docker)

```bash
# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment
cp .env.example .env

# 4. Run migrations
alembic upgrade head

# 5. Start the API
uvicorn app.main:app --reload
```

> PostgreSQL and Redis must be running locally.

---

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/lux_delivery
POSTGRES_USER=user
POSTGRES_PASSWORD=strong_password
POSTGRES_DB=lux_delivery

# Redis
REDIS_URL=redis://:password@localhost:6379/0
REDIS_PASSWORD=strong_redis_password

# JWT
SECRET_KEY=your_jwt_secret_key_at_least_32_chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Bootstrap admin (minimum 32 characters)
BOOTSTRAP_ADMIN_TOKEN=secure_token_to_create_first_admin_32chars

# Rate limiting
AUTH_RATE_LIMIT_MAX_ATTEMPTS=10
AUTH_RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX_PER_IP=120
RATE_LIMIT_MAX_PER_USER=300

# Pagination and analytics
PRODUCTS_MAX_PAGE_SIZE=100
ANALYTICS_MAX_RANGE_DAYS=93

# Cache TTLs (seconds)
TTL_PRODUCTS_LIST=300
TTL_CATEGORIES=600
TTL_ORDERS_LIST=60
TTL_USER=1800

# Upload
MAX_UPLOAD_SIZE=5242880
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp,image/gif

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_key
SUPABASE_BUCKET=products

# CORS and proxy
CORS_ORIGINS=["http://localhost:3000"]
TRUSTED_PROXIES=["127.0.0.1"]

# Environment
ENV=development
```

---

## Security

- Non-root user inside Docker container
- Multi-stage build (final image has no build tools)
- Redis protected with password
- Database and Redis ports not exposed to host in production
- Global rate limiting (IP + user) via Redis + extra limiter on auth routes
- Refresh token rotation with reuse detection — JTI hashed with SHA-256
- HttpOnly cookies + SameSite=Strict + Secure in production
- Passwords hashed with bcrypt + strength validation (uppercase, lowercase, number, special char, min 10 chars)
- Mass-assignment protection via `_UPDATABLE_FIELDS` in all repositories
- Magic bytes validation on image upload
- Swagger/ReDoc disabled in production
- Security headers (X-Frame-Options, nosniff, HSTS, Referrer-Policy, Permissions-Policy)
- `pg_advisory_xact_lock` on bootstrap admin to prevent race condition

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
