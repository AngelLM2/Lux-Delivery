# Lux Delivery Front-End

English | [Português (BR)](./README.pt-BR.md)

Premium food delivery front-end built with React + TypeScript + Vite.
It covers the full customer journey (browse the menu, place orders, track deliveries live) and an admin workspace (dashboard, order board, products, categories, users).

## Table of contents
1. [Overview](#overview)
2. [Tech stack](#tech-stack)
3. [Core features](#core-features)
4. [Project structure](#project-structure)
5. [Requirements](#requirements)
6. [Environment variables](#environment-variables)
7. [Getting started](#getting-started)
8. [Available scripts](#available-scripts)
9. [Routing and access control](#routing-and-access-control)
10. [API integration notes](#api-integration-notes)

## Overview
Lux Delivery is a responsive SPA focused on:

- A polished storefront with highlighted products and animated transitions.
- Server-side filtering and cursor pagination ("Carregar mais" / infinite scroll).
- A checkout that can be retried safely (idempotent order creation).
- Role-based areas for customers and admins.
- Real-time order tracking, notifications and an operations board over Server-Sent Events.

## Tech stack
- React 18 + TypeScript (strict)
- Vite 7
- React Router DOM 6
- TanStack Query 5 (server state, cache, infinite queries)
- Zustand (auth, cart and UI state)
- Axios (API client + interceptors)
- openapi-typescript (API types generated from the backend contract)
- Framer Motion (page transitions), Lucide React (icons)
- Vitest + Testing Library, ESLint 9

## Core features
### Customer area
- Landing page with highlighted products.
- Menu with category filter and search resolved by the API, plus infinite loading.
- "Sold out" products cannot be added to the cart.
- Cart drawer with quantity control, address and notes; checkout sends an `Idempotency-Key`.
- Order history and order detail with a live timeline ("Ao vivo" indicator).
- Notifications with unread badge, filter, mark one / mark all as read.
- Profile with personal data and password change.

### Admin area
- Dashboard: KPIs (orders, revenue, average ticket, cancel rate, end-to-end p50/p90), daily revenue/orders chart (dependency-free SVG), status breakdown, time per stage and top products, for 7/30/90 days.
- Live order board: status tabs, one-click "advance to next status" (`created -> confirmed -> preparing -> out_for_delivery -> delivered`), cancel with optional reason, conflict (409) handling.
- Products: create/edit, image upload, availability, archive/restore.
- Categories: create/edit/delete with menu position.
- Users: filter by role, search, create (with role), activate/deactivate.

### Reliability and UX details
- Route-level code splitting with `lazy` + `Suspense`; global `ErrorBoundary` that resets on navigation.
- Single-flight session refresh shared by API calls and the SSE reconnection.
- SSE reconnection with exponential backoff + jitter and a cache resync after reconnecting.
- Only network/5xx errors are retried; 5xx toasts include a short request id for support.
- User-scoped cache is cleared on logout.

## Project structure
```text
src/
|- app/                 # App shell, routes (lazy pages), providers, realtime (SSE)
|- features/
|  |- auth/             # api, zustand store, login/register pages, ProtectedRoute
|  |- catalog/          # api, query hooks, product components, home + menu pages
|  |- cart/             # cart store, checkout drawer
|  |- orders/           # api, hooks, status rules, order components and pages
|  |- notifications/    # api, hooks, notifications page
|  |- profile/          # profile api + page
|  |- admin/            # layout, dashboard/board/CRUD pages, charts and tables
|- shared/
|  |- api/              # axios client, generated schema.d.ts, type aliases, pagination
|  |- ui/               # design-system primitives (Button, Modal, Toast, ...)
|  |- layout/           # Navbar, Sidebar, PageWrapper, ErrorBoundary, ...
|  |- hooks/            # useDebounce, usePageMeta, useScrollReveal, useIdempotencyKey
|  |- lib/              # formatters, validators, errors, backoff
|  |- stores/           # UI store (toasts, cart drawer)
|  |- styles/           # global styles and tokens
|- test/                # test setup and fixtures
|- main.tsx
openapi.json            # backend contract (source of truth for src/shared/api/schema.d.ts)
```

## Requirements
- Node.js 22+ and npm 10+
- Lux Delivery API running (default: `http://localhost:8000`)

## Environment variables
Create a `.env` file (see `.env.example`):

```bash
VITE_API_URL=/api/v1
```

Notes:
- The app is same-origin by design: in development Vite proxies `/api` and `/media` to `http://localhost:8000`; in production nginx does the same. HttpOnly `SameSite` session cookies and SSE work without CORS.
- If `VITE_API_URL` is not set, the client falls back to `/api/v1`.

## Getting started
```bash
npm install
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npm run dev            # http://localhost:3000
```

## Available scripts
| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server on port `3000` |
| `npm run build` | Type-checks and builds the production bundle |
| `npm run preview` | Serves the built app locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm test` / `npm run test:watch` | Vitest (jsdom) |
| `npm run gen:api` | Regenerates `src/shared/api/schema.d.ts` from `openapi.json` |
| `npm run check:api` | Fails if the committed types drifted from `openapi.json` (CI) |

## Routing and access control
Public routes: `/`, `/menu`, `/login`, `/register`.

Authenticated routes: `/orders`, `/orders/:id`, `/notifications`, `/profile`.

Admin-only routes: `/admin`, `/admin/orders`, `/admin/products`, `/admin/categories`, `/admin/users`.

`ProtectedRoute` waits for the session check, sends anonymous users to `/login` (and back to the requested page after signing in) and keeps non-admins out of `/admin`.

## API integration notes
- Contract-first: every API type is an alias of the types generated from `openapi.json` (`src/shared/api/types.ts`); a contract change becomes a compile error.
- Errors follow `{ detail, code, request_id }`; `shared/lib/errors.ts` maps them to pt-BR messages and per-field form errors.
- On `401` the client refreshes the session once (shared by concurrent requests) and replays the request; if another tab already rotated the refresh token (`refresh_token_rotated`) it simply replays.
- List endpoints use cursor pagination (`{ items, next_cursor }`) with `useInfiniteQuery`.
- `POST /orders` is sent with an `Idempotency-Key` that is reused on retries and renewed when the order content changes.
- `GET /events/stream` (SSE) drives cache invalidation for orders and notifications in real time.
