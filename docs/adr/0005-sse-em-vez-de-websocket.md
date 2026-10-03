# ADR-0005 — Server-Sent Events em vez de WebSocket para tempo real

- **Status:** aceito
- **Contexto:** o cliente precisa ver o status do pedido mudar, e o admin precisa ver pedidos novos
  chegando. Todo o tráfego de tempo real vai do servidor para o cliente; as ações do usuário já são
  requisições REST.
- **Decisão:** `GET /api/v1/events/stream` com SSE, autenticado pelo cookie. Cada processo da API mantém
  **uma** assinatura `PSUBSCRIBE lux:rt:*` no Redis e distribui para as conexões locais (hub). Eventos
  são dicas; o cliente reconsulta o REST.
- **Alternativas:** WebSocket (bidirecional sem necessidade, upgrade de protocolo que alguns proxies
  tratam mal, sem reconexão nativa); polling (simples, mas N clientes × 1 req a cada poucos segundos
  e latência ruim).
- **Consequências:** (+) HTTP comum (funciona com CDN, HTTP/2 multiplexing, `EventSource` com reconexão
  nativa). (+) Conexões com o Redis escalam com pods, não com usuários. (−) Conexões longas exigem
  `proxy_buffering off`/timeouts longos no nginx e, no estágio 5, um deployment separado.
