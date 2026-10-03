# 01 — Requisitos e estimativas de capacidade

## 1. O produto

Lux Delivery é a plataforma de delivery de um restaurante (ou de uma pequena rede): o cliente navega
pelo cardápio, monta o carrinho, faz o pedido e acompanha cada etapa **em tempo real**; a equipe
gerencia o cardápio, avança os pedidos num quadro e acompanha métricas de operação (volume, receita,
ticket médio, tempos de preparo e entrega).

### Atores
| Ator | O que faz |
|---|---|
| Visitante | Navega pelo cardápio (sem login) |
| Cliente | Cadastra-se, faz pedidos, cancela antes do preparo, acompanha em tempo real, recebe notificações |
| Admin / atendente | Gerencia categorias, produtos e imagens; avança e cancela pedidos; gerencia usuários; vê analytics |

## 2. Requisitos funcionais

| ID | Requisito | Onde |
|---|---|---|
| RF01 | Cadastro e login com sessão segura (cookies HttpOnly, refresh rotativo) | `identity` |
| RF02 | Cardápio público com categorias, busca, filtros (ofertas, destaques) e paginação | `catalog` |
| RF03 | Admin cria/edita/arquiva produtos (soft delete), marca indisponível, envia imagem | `catalog` |
| RF04 | Cliente cria pedido; repetir a requisição não duplica o pedido | `ordering` |
| RF05 | Ciclo de vida com regras por papel: só o admin avança; o cliente cancela até a confirmação | `ordering/domain.py` |
| RF06 | Linha do tempo de cada pedido (quem mudou, quando) | `order_tracking_events` |
| RF07 | Notificações persistentes por mudança de status, com contador de não lidas | `notifications` |
| RF08 | Atualização em tempo real para cliente (seu pedido) e admin (novos pedidos) | SSE + worker |
| RF09 | Dashboard: pedidos, receita, ticket médio, cancelamento, p50/p90 de cada etapa, série diária, top produtos | `analytics` |
| RF10 | Admin gerencia usuários (criar com papel, ativar/desativar com efeito imediato) | `identity` |

## 3. Requisitos não funcionais e SLOs

| Categoria | Requisito | Meta (SLO) | Como é medido |
|---|---|---|---|
| Disponibilidade | API responde sem erro 5xx | **99,9%** mensal (~43 min de orçamento de erro) | `lux_http_requests_total{status=~"5.."}` |
| Latência (leitura) | cardápio, listas | **p95 < 200 ms** | histograma `lux_http_request_duration_seconds` |
| Latência (escrita) | criar pedido, mudar status | **p95 < 400 ms** | idem, por rota |
| Tempo real | evento visível no navegador após o commit | **p95 < 2 s** | outbox → stream → SSE |
| Durabilidade | pedido confirmado nunca se perde | RPO 5 min / RTO 1 h (estágio 3+) | backup + WAL (PITR) |
| Consistência | sem pedido duplicado, sem transição inválida | 0 ocorrências | constraints + testes de concorrência |
| Segurança | OWASP Top 10 coberto; senhas bcrypt; sessões revogáveis | - | [05 — Segurança](05-seguranca.md) |
| Operabilidade | logs estruturados, métricas, alertas, health checks | - | [10 — Observabilidade](10-observabilidade-e-runbooks.md) |
| Escalabilidade | escalar a API horizontalmente sem mudar código | stateless | [07 — Escalabilidade](07-escalabilidade/README.md) |

**Por que 99,9% e não 99,99%?** Cada "9" a mais custa aproximadamente uma ordem de grandeza em
complexidade (multi-AZ ativo-ativo, failover automático testado, deploy canário). Para um delivery
regional, 43 minutos por mês de indisponibilidade são aceitáveis; para um gateway de pagamento,
não seriam. SLO é decisão de negócio, não de engenharia.

## 4. Modelo de carga (back-of-the-envelope)

Todas as contas do tutorial de escala usam este modelo. Quando um estágio fala em "N usuários",
significa **N usuários ativos por dia (DAU)**.

| Premissa | Valor | Justificativa |
|---|---|---|
| Requisições por usuário ativo/dia | 30 | ~20 de navegação, ~5 de checkout, ~5 de acompanhamento |
| Taxa de conversão | 30% dos ativos fazem 1 pedido | delivery tem alta intenção de compra |
| Concentração | 60% do tráfego em 3 h (almoço + jantar) | padrão de food delivery |
| Fator de rajada | 2× sobre a média do pico | promoções, chuva, final de jogo |
| Escritas por pedido | ~15 (média) | criação: order, ~2,4 itens, idempotência, outbox, tracking; cada transição: update + tracking + outbox + notificação (nem todo pedido passa por todas) |
| Duração de um pedido ativo | ~45 min | criação → entrega (p50 medido no seed: ~54 min) |
| Armazenamento por pedido | ~2 KB com índices | medido: ~1,5 KB ([03 §8](03-modelagem-de-dados.md#8-volume-crescimento-e-retenção)) |

Fórmulas:

```
RPS_pico           = DAU × 30 × 0,6 / (3 × 3600 s) × 2   ≈ DAU × 0,0033
pedidos/s no pico  = DAU × 0,3 × 0,6 / 10800 × 2         ≈ DAU × 0,000033
SSE simultâneos    = pedidos/s no pico × 2700 s (45 min) + admins
dados/ano          = DAU × 0,3 × 365 × 2 KB
```

| DAU | Req/dia | RPS pico | Pedidos/dia | Pedidos/s pico | Escritas/s pico* | SSE simultâneos | Dados/ano |
|---|---|---|---|---|---|---|---|
| 10 | 300 | ~0,03 | 3 | ~0 | ~0 | ~1 | ~2 MB |
| 100 | 3 mil | ~0,3 | 30 | ~0,003 | ~0,05 | ~10 | ~22 MB |
| 1 mil | 30 mil | ~3 | 300 | ~0,03 | ~0,5 | ~90 | ~220 MB |
| 10 mil | 300 mil | ~33 | 3 mil | ~0,3 | ~5 | ~900 | ~2,2 GB |
| 100 mil | 3 M | ~330 | 30 mil | ~3,3 | ~50 | ~9 mil | ~22 GB |
| 1 milhão | 30 M | ~3.300 | 300 mil | ~33 | ~500 | ~90 mil | ~220 GB |
| 10 milhões | 300 M | ~33.000 | 3 M | ~330 | ~5.000 | ~900 mil | ~2,2 TB |

\* escritas/s = linhas inseridas/atualizadas por segundo (pedido + transições + eventos + notificações).

**Leitura da tabela:**

- Até ~10 mil DAU o sistema é **pequeno**: 33 RPS no pico cabem numa única instância (medido: ver
  [09](09-testes-de-carga.md)). O risco nessa faixa é disponibilidade (um ponto único de falha), não
  desempenho.
- O primeiro limite real não é CPU, é **conexões**: cada réplica abre um pool de conexões com o
  Postgres, e o `max_connections` acaba antes do processador. Por isso o PgBouncer aparece no
  estágio 3.
- O tráfego é **muito mais leitura que escrita** (~100:1). Cache do cardápio e réplicas de leitura
  rendem mais do que qualquer otimização de escrita.
- **SSE é o recurso que mais cresce**: 90 mil conexões abertas com 1 M de DAU. Conexão ociosa custa
  memória (~10–20 KB cada num servidor async), não CPU. Por isso o hub tem uma única assinatura Redis
  por processo.
- Escritas só viram problema perto de 10 M DAU (~5 mil linhas/s). Até lá, um primário Postgres bem
  configurado aguenta com folga. Particionar e federar vêm antes de *sharding*.
- Dados: até 1 M DAU tudo cabe num único Postgres (centenas de GB). O que pesa é *manutenção*
  (VACUUM, índices, backups longos), o que motiva particionamento por mês e retenção.

## 5. Fora de escopo (deliberadamente)

| Item | Por que fora | Onde seria encaixado |
|---|---|---|
| Pagamento online | exige PCI e um gateway de pagamento, com webhooks idempotentes | novo módulo `payments` + inbox de webhooks |
| Múltiplos restaurantes (marketplace) | muda a chave de particionamento de tudo | `restaurant_id` em todas as tabelas + RLS (Row-Level Security) |
| Roteirização de entregadores | outro domínio (geo, otimização) | serviço separado, consumidor de `order.status_changed` |
| Estoque | não há controle de insumos | `catalog` com `stock` e reserva na saga do pedido |
