# ADR-0003 — Sessão em cookies HttpOnly com refresh token rotativo por família

- **Status:** aceito
- **Contexto:** SPA no mesmo domínio da API (nginx). Tokens em `localStorage` são legíveis por qualquer
  script (XSS, dependência comprometida, extensão).
- **Decisão:** access token JWT de 15 min no cookie `lux_access` (`HttpOnly; Secure; SameSite=Strict;
  Path=/`) e refresh de 7 dias no cookie `lux_refresh` restrito a `Path=/api/v1/auth`. O refresh
  **rotaciona** a cada uso; reapresentar um token já rotacionado revoga a família inteira (detecção de
  roubo), com uma janela de graça de 10 s para abas concorrentes. Logout coloca o `jti` do access numa
  denylist até ele expirar. Clientes não-browser usam `POST /auth/token` (Bearer).
- **Alternativas:** Bearer em `localStorage` (vulnerável a exfiltração); sessão opaca no servidor (mais
  simples de revogar, mas uma consulta por request; equivalente ao nosso status em cache).
- **Consequências:** (+) XSS não leva a sessão embora; CSRF mitigado por `SameSite=Strict` + JSON
  obrigatório + CORS restrito. (−) Front e API precisam estar no mesmo site (resolvido pelo nginx
  same-origin). (−) A rotação exige cuidado com concorrência, coberto por testes.
