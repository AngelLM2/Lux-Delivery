# Lux Delivery Front-End

[English](./README.md) | Portugues (BR)

Front-end de delivery premium construido com React + TypeScript + Vite.
Este app cobre a jornada completa do cliente (navegar no cardapio, fazer pedido, acompanhar entrega) e uma area administrativa (dashboard, pedidos, produtos, categorias e usuarios).

## Sumario
1. [Visao geral](#visao-geral)
2. [Stack tecnica](#stack-tecnica)
3. [Funcionalidades principais](#funcionalidades-principais)
4. [Estrutura do projeto](#estrutura-do-projeto)
5. [Requisitos](#requisitos)
6. [Variaveis de ambiente](#variaveis-de-ambiente)
7. [Como rodar localmente](#como-rodar-localmente)
8. [Scripts disponiveis](#scripts-disponiveis)
9. [Rotas e controle de acesso](#rotas-e-controle-de-acesso)
10. [Notas de integracao com API](#notas-de-integracao-com-api)

## Visao geral
O Lux Delivery e uma SPA responsiva focada em:

- Experiencia de vitrine com destaque para produtos e transicoes animadas.
- Navegacao rapida com filtros no cliente e carregamento paginado.
- Fluxo de carrinho e checkout conectado ao backend.
- Areas separadas por perfil (cliente e admin).
- Fluxos operacionais em tempo real (status do pedido, notificacoes e analytics).

## Stack tecnica
- React 18 + TypeScript
- Vite 7
- React Router DOM 6
- TanStack Query (estado remoto + cache)
- Zustand (estado de UI e cliente)
- Axios (cliente HTTP + interceptors)
- Framer Motion (transicoes de pagina)
- Lucide React (icones)
- ESLint 9

## Funcionalidades principais
### Area do cliente
- Home com produtos em destaque.
- Cardapio com filtro por categoria, busca com debounce e carregamento progressivo/infinito.
- Carrinho lateral com controle de quantidade, endereco e observacoes.
- Criacao de pedidos e historico do cliente.
- Detalhe do pedido com timeline/rastreamento.
- Tela de notificacoes com filtro de nao lidas e marcar como lida.
- Perfil com edicao de dados e troca de senha.

### Area administrativa
- Dashboard com cards KPI e grafico por status de pedido.
- Gestao de pedidos com transicoes controladas (`created -> confirmed -> preparing -> out_for_delivery -> delivered`), cancelamento quando permitido e observacao opcional por mudanca de status.
- Gestao de produtos (criar/editar/remover + upload de imagem).
- Gestao de categorias (criar/editar/remover).
- Gestao de usuarios (ativar/desativar).

### Confiabilidade e UX
- Code splitting por rota com `lazy` + `Suspense`.
- Fallback global via `ErrorBoundary`.
- Sistema de toasts para feedback de API e UX.
- Recuperacao de sessao via endpoint de refresh token.
- Atualizacoes otimistas em fluxos de pedidos/notificacoes.

## Estrutura do projeto
```text
Front-End/
|- public/
|- src/
|  |- api/           # Cliente Axios + modulos de API + tipos
|  |- components/    # Componentes reutilizaveis de UI e features
|  |- hooks/         # Hooks de query e comportamento de interface
|  |- pages/         # Paginas de rota (cliente + admin)
|  |- stores/        # Stores Zustand (auth, cart, UI)
|  |- styles/        # Estilos globais e por feature
|  |- utils/         # Formatadores, validadores e helpers de erro
|  |- App.tsx
|  |- main.tsx
|- .env.example
|- package.json
|- vite.config.ts
```

## Requisitos
- Node.js 20+ (recomendado para projetos Vite 7)
- npm 10+ (ou gerenciador compativel)
- API do Lux Delivery em execucao (padrao: `http://localhost:8000`)

## Variaveis de ambiente
Crie um arquivo `.env` na raiz do projeto:

```bash
VITE_API_URL=http://localhost:8000
```

Observacoes:
- Se `VITE_API_URL` nao estiver definido, o app usa `/api`.
- Em desenvolvimento, o proxy do Vite redireciona `/api` para `http://localhost:8000`.

## Como rodar localmente
1. Instale as dependencias:

```bash
npm install
```

2. Crie seu arquivo de ambiente local:

```bash
cp .env.example .env
```

Alternativa no PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

4. Abra:

```text
http://localhost:3000
```

## Scripts disponiveis
| Script | Descricao |
| --- | --- |
| `npm run dev` | Inicia o servidor Vite na porta `3000` |
| `npm run build` | Faz type-check e gera build de producao |
| `npm run preview` | Sobe localmente o build gerado |
| `npm run lint` | Executa o ESLint no projeto |

## Rotas e controle de acesso
Rotas publicas:
- `/`
- `/menu`
- `/login`
- `/register`

Rotas autenticadas:
- `/orders`
- `/orders/:id`
- `/notifications`
- `/profile`

Rotas exclusivas de admin:
- `/admin`
- `/admin/orders`
- `/admin/products`
- `/admin/categories`
- `/admin/users`

O controle de acesso e feito por `ProtectedRoute` com base no papel do usuario (`admin` ou `customer`).

## Notas de integracao com API
- O cliente `axios` esta configurado com `withCredentials: true`.
- A autenticacao usa cookies HTTP-only com fluxo de refresh em `/auth/refresh`.
- Em `401`, o cliente tenta refresh antes de redirecionar para `/login`.
- Estado de queries/mutations e gerenciado com TanStack Query (cache + invalidacao).
- Erros da API sao exibidos por toast e mapeados para erros de campo quando aplicavel.
