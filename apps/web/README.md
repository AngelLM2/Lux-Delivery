# Lux Delivery Front-End

English | [Portugues (BR)](./README.pt-BR.md)

Premium food delivery front-end built with React + TypeScript + Vite.
This app covers the full customer journey (browse menu, place orders, track delivery) and an admin workspace (dashboard, orders, products, categories, users).

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

- A polished storefront experience with highlighted products and animated transitions.
- Fast browsing with client-side filters and paginated product loading.
- Cart and checkout flow connected to a backend API.
- Role-based areas for customers and admins.
- Live-like operational workflows (order status updates, notifications, analytics).

## Tech stack
- React 18 + TypeScript
- Vite 7
- React Router DOM 6
- TanStack Query (server state + caching)
- Zustand (UI and client state)
- Axios (API client + interceptors)
- Framer Motion (page transitions)
- Lucide React (icons)
- ESLint 9

## Core features
### Customer area
- Landing page with highlighted products.
- Menu with category filters, debounced search, and infinite loading support.
- Cart drawer with quantity control, address, and notes.
- Order creation and order history.
- Order detail page with timeline/tracking.
- Notifications view with unread filter and mark-as-read.
- Profile page with personal data and password update.

### Admin area
- Dashboard with KPI cards and order status chart.
- Order management with controlled status transitions (`created -> confirmed -> preparing -> out_for_delivery -> delivered`), cancel flow where allowed, and optional status notes.
- Product management (create/update/delete + image upload).
- Category management (create/update/delete).
- User management (activate/deactivate).

### Reliability and UX details
- Route-level code splitting with `lazy` + `Suspense`.
- Global `ErrorBoundary` fallback.
- Toast feedback system for API and UX events.
- Session recovery via refresh token endpoint.
- Optimistic updates in selected order/notification flows.

## Project structure
```text
Front-End/
|- public/
|- src/
|  |- api/           # Axios client + API modules + shared types
|  |- components/    # Reusable UI and feature components
|  |- hooks/         # Query hooks and UI behavior hooks
|  |- pages/         # Route pages (customer + admin)
|  |- stores/        # Zustand stores (auth, cart, UI)
|  |- styles/        # Global and feature styles
|  |- utils/         # Formatters, validators, error helpers
|  |- App.tsx
|  |- main.tsx
|- .env.example
|- package.json
|- vite.config.ts
```

## Requirements
- Node.js 20+ (recommended for Vite 7 projects)
- npm 10+ (or compatible package manager)
- Lux Delivery backend API running (default: `http://localhost:8000`)

## Environment variables
Create a `.env` file in the project root:

```bash
VITE_API_URL=http://localhost:8000
```

Notes:
- If `VITE_API_URL` is not set, the app falls back to `/api`.
- In local development, Vite proxy forwards `/api` to `http://localhost:8000`.

## Getting started
1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.example .env
```

PowerShell alternative:

```powershell
Copy-Item .env.example .env
```

3. Start development server:

```bash
npm run dev
```

4. Open:

```text
http://localhost:3000
```

## Available scripts
| Script | Description |
| --- | --- |
| `npm run dev` | Starts Vite dev server on port `3000` |
| `npm run build` | Type-checks and builds production bundle |
| `npm run preview` | Serves built app locally for preview |
| `npm run lint` | Runs ESLint over the project |

## Routing and access control
Public routes:
- `/`
- `/menu`
- `/login`
- `/register`

Authenticated routes:
- `/orders`
- `/orders/:id`
- `/notifications`
- `/profile`

Admin-only routes:
- `/admin`
- `/admin/orders`
- `/admin/products`
- `/admin/categories`
- `/admin/users`

Access control is handled by `ProtectedRoute` and user role (`admin` or `customer`).

## API integration notes
- `axios` client is configured with `withCredentials: true`.
- Auth uses HTTP-only cookies and refresh flow via `/auth/refresh`.
- On `401`, the client tries token refresh before redirecting to `/login`.
- Query/mutation state is handled with TanStack Query (cache + invalidation).
- API errors are surfaced through toast notifications and field-level mapping helpers.

