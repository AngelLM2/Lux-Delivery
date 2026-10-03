# ADR-0007 — Paginação keyset com cursor opaco

- **Status:** aceito
- **Contexto:** listas que crescem sem limite (pedidos, notificações) e o painel admin rolando por
  milhares de pedidos.
- **Decisão:** paginação por `(created_at, id) < (cursor)` com índice composto, cursor em base64 opaco,
  resposta `{items, next_cursor}`. A condição usa **comparação de tupla**, porque a forma com `OR` não
  vira condição de índice (medido: 8 ms → 0,2 ms; protegido por teste de plano).
- **Alternativas:** `OFFSET/LIMIT` (custo O(offset), duplicados/pulos quando dados entram entre páginas).
- **Consequências:** (+) custo constante em qualquer página; estável sob inserções. (−) Não dá para
  "pular para a página 37"; ordenações arbitrárias exigem índices específicos.
