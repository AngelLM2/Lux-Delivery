# Lux Delivery Front-End

[English](./README.md) | Português (BR)

Front-end de delivery premium construído com React + TypeScript + Vite.
O app cobre a jornada completa do cliente (navegar no cardápio, fazer pedido, acompanhar a entrega ao vivo) e uma área administrativa (dashboard, quadro de pedidos, produtos, categorias e usuários).

## Sumário
1. [Visão geral](#visão-geral)
2. [Stack técnica](#stack-técnica)
3. [Funcionalidades principais](#funcionalidades-principais)
4. [Estrutura do projeto](#estrutura-do-projeto)
5. [Requisitos](#requisitos)
6. [Variáveis de ambiente](#variáveis-de-ambiente)
7. [Como rodar localmente](#como-rodar-localmente)
8. [Scripts disponíveis](#scripts-disponíveis)
9. [Rotas e controle de acesso](#rotas-e-controle-de-acesso)
10. [Notas de integração com a API](#notas-de-integração-com-a-api)

## Visão geral
O Lux Delivery é uma SPA responsiva focada em:

- Vitrine com produtos em destaque e transições animadas.
- Filtros resolvidos no servidor e paginação por cursor ("Carregar mais" / scroll infinito).
- Checkout que pode ser repetido com segurança (criação de pedido idempotente).
- Áreas separadas por perfil (cliente e admin).
- Rastreamento de pedidos, notificações e quadro operacional em tempo real via Server-Sent Events.

## Stack técnica
- React 18 + TypeScript (strict)
- Vite 7
- React Router DOM 6
- TanStack Query 5 (estado remoto, cache, infinite queries)
- Zustand (estado de autenticação, carrinho e UI)
- Axios (cliente HTTP + interceptors)
- openapi-typescript (tipos da API gerados a partir do contrato do backend)
- Framer Motion (transições), Lucide React (ícones)
- Vitest + Testing Library, ESLint 9

## Funcionalidades principais
### Área do cliente
- Home com produtos em destaque.
- Cardápio com filtro por categoria e busca feitos pela API, com carregamento infinito.
- Produtos "Esgotado" não podem ser adicionados ao carrinho.
- Carrinho lateral com quantidade, endereço e observações; o checkout envia `Idempotency-Key`.
- Histórico e detalhe do pedido com timeline ao vivo (indicador "Ao vivo").
- Notificações com contador de não lidas, filtro, marcar uma / marcar todas como lidas.
- Perfil com dados pessoais e troca de senha.

### Área administrativa
- Dashboard: KPIs (pedidos, receita, ticket médio, taxa de cancelamento, tempo total p50/p90), gráfico diário de receita/pedidos (SVG sem dependências), pedidos por status, tempo por etapa e produtos mais vendidos, em 7/30/90 dias.
- Quadro de pedidos ao vivo: abas por status, botão de um clique para avançar (`created -> confirmed -> preparing -> out_for_delivery -> delivered`), cancelamento com motivo opcional e tratamento de conflito (409).
- Produtos: cadastro/edição, upload de imagem, disponibilidade, arquivar/restaurar.
- Categorias: criar/editar/remover com posição no cardápio.
- Usuários: filtro por perfil, busca, cadastro (com perfil), ativar/desativar.

### Confiabilidade e UX
- Code splitting por rota com `lazy` + `Suspense`; `ErrorBoundary` global que se recupera ao navegar.
- Refresh de sessão "single-flight", compartilhado entre as chamadas à API e a reconexão do SSE.
- Reconexão do SSE com backoff exponencial + jitter e ressincronização do cache ao reconectar.
- Só erros de rede/5xx são repetidos; toasts de 5xx mostram um código curto (request id) para o suporte.
- Cache de dados do usuário é limpo no logout.

## Estrutura do projeto
```text
src/
|- app/                 # shell do app, rotas (páginas lazy), providers, realtime (SSE)
|- features/
|  |- auth/             # api, store zustand, login/cadastro, ProtectedRoute
|  |- catalog/          # api, hooks de query, componentes de produto, home e cardápio
|  |- cart/             # store do carrinho, gaveta de checkout
|  |- orders/           # api, hooks, regras de status, componentes e páginas de pedido
|  |- notifications/    # api, hooks, página de notificações
|  |- profile/          # api e página de perfil
|  |- admin/            # layout, dashboard/quadro/CRUDs, gráficos e tabelas
|- shared/
|  |- api/              # cliente axios, schema.d.ts gerado, aliases de tipos, paginação
|  |- ui/               # componentes base (Button, Modal, Toast, ...)
|  |- layout/           # Navbar, Sidebar, PageWrapper, ErrorBoundary, ...
|  |- hooks/            # useDebounce, usePageMeta, useScrollReveal, useIdempotencyKey
|  |- lib/              # formatters, validators, errors, backoff
|  |- stores/           # store de UI (toasts, gaveta do carrinho)
|  |- styles/           # estilos globais e tokens
|- test/                # setup e fixtures de teste
|- main.tsx
openapi.json            # contrato do backend (fonte de src/shared/api/schema.d.ts)
```

## Requisitos
- Node.js 22+ e npm 10+
- API do Lux Delivery rodando (padrão: `http://localhost:8000`)

## Variáveis de ambiente
Crie um arquivo `.env` (veja `.env.example`):

```bash
VITE_API_URL=/api/v1
```

Notas:
- O app é same-origin por design: em desenvolvimento o Vite faz proxy de `/api` e `/media` para `http://localhost:8000`; em produção o nginx faz o mesmo. Cookies de sessão HttpOnly `SameSite` e SSE funcionam sem CORS.
- Sem `VITE_API_URL`, o cliente usa `/api/v1`.

## Como rodar localmente
```bash
npm install
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npm run dev            # http://localhost:3000
```

## Scripts disponíveis
| Script | Descrição |
| --- | --- |
| `npm run dev` | Servidor do Vite na porta `3000` |
| `npm run build` | Checa tipos e gera o bundle de produção |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm test` / `npm run test:watch` | Vitest (jsdom) |
| `npm run gen:api` | Regera `src/shared/api/schema.d.ts` a partir do `openapi.json` |
| `npm run check:api` | Falha se os tipos commitados divergirem do `openapi.json` (CI) |

## Rotas e controle de acesso
Rotas públicas: `/`, `/menu`, `/login`, `/register`.

Rotas autenticadas: `/orders`, `/orders/:id`, `/notifications`, `/profile`.

Rotas apenas admin: `/admin`, `/admin/orders`, `/admin/products`, `/admin/categories`, `/admin/users`.

O `ProtectedRoute` espera a verificação da sessão, envia anônimos para `/login` (voltando à página pedida após o login) e bloqueia não-admins em `/admin`.

## Notas de integração com a API
- Contract-first: todo tipo da API é um alias dos tipos gerados do `openapi.json` (`src/shared/api/types.ts`); uma mudança de contrato vira erro de compilação.
- Erros seguem `{ detail, code, request_id }`; `shared/lib/errors.ts` converte para mensagens em pt-BR e erros por campo.
- Em `401` o cliente renova a sessão uma única vez (compartilhado entre requisições simultâneas) e repete a chamada; se outra aba já rotacionou o refresh token (`refresh_token_rotated`), apenas repete.
- Endpoints de listagem usam paginação por cursor (`{ items, next_cursor }`) com `useInfiniteQuery`.
- `POST /orders` envia `Idempotency-Key`, reutilizada em novas tentativas e renovada quando o conteúdo do pedido muda.
- `GET /events/stream` (SSE) invalida o cache de pedidos e notificações em tempo real.
