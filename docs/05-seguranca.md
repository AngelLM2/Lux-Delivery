# 05 — Segurança

> Defesa em camadas: cada controle assume que o anterior pode falhar. Toda afirmação abaixo tem um
> teste correspondente em `apps/api/tests` (citado entre parênteses).

## 1. Modelo de ameaças (STRIDE)

| Ameaça | Exemplo no Lux | Controles |
|---|---|---|
| **S**poofing (falsificar identidade) | roubar a sessão de um cliente; forjar um JWT | cookies `HttpOnly` + `Secure` + `SameSite=Strict`; JWT com `iss`, `type`, `exp`, `nbf`, `jti` e algoritmo fixo (`alg=none` rejeitado: `test_alg_none_is_rejected`); refresh rotativo com detecção de reuso (`test_reused_refresh_token_revokes_the_whole_family`) |
| **T**ampering (adulterar dados) | mudar o preço no corpo do pedido; reenviar o pedido alterado | preço vem **do banco**, nunca do cliente; `Idempotency-Key` com hash do payload (`test_idempotency_key_with_different_payload_is_rejected`); constraints `CHECK` no banco |
| **R**epudiation (negar autoria) | "não fui eu que cancelei o pedido" | `order_tracking_events` registra quem fez cada transição; logs JSON com `request_id` e `user_id` |
| **I**nformation disclosure (vazamento) | ver o pedido de outro cliente (IDOR); descobrir quais e-mails têm conta | pedido alheio responde **404**, e não 403 (`test_customers_cannot_see_each_others_orders`); a mesma mensagem e o mesmo tempo de resposta para e-mail inexistente e senha errada (`test_login_error_does_not_reveal_whether_email_exists`, hash falso com bcrypt); `/docs` desligado em produção; `/metrics` fora do nginx público |
| **D**enial of service | rajada de requisições; brute force de senha; upload de imagem gigante | rate limit global (IP e usuário) + por rota de auth + **por conta** no login, contando só falhas (`test_login_is_limited_per_account_across_ips`, `test_successful_logins_do_not_consume_the_account_limit`); load shedding (`test_load_shedding_rejects_beyond_the_in_flight_limit`); upload limitado a 5 MB lido em blocos e proteção contra *decompression bomb* |
| **E**levation of privilege | cliente se registrar como admin; cliente confirmar o próprio pedido | `register` ignora `role` (`test_register_cannot_escalate_role`); papel lido do banco a cada request; regras de transição por papel (`test_owner_cannot_confirm_own_order`); *mass assignment* bloqueado por whitelist nos repositórios |

## 2. Autenticação

### Por que cookies e não `Authorization: Bearer` no `localStorage`
Um token em `localStorage` pode ser lido por **qualquer** script da página: um XSS, uma dependência
npm comprometida ou uma extensão maliciosa exfiltra a sessão. Um cookie `HttpOnly` não é acessível por
JavaScript. O XSS continua sendo grave (o script pode fazer requisições como o usuário enquanto a
página está aberta), mas não consegue **levar** a sessão para outro lugar. Clientes não-browser
(Swagger, k6, scripts) usam `POST /auth/token`, que devolve um Bearer.

| Cookie | Conteúdo | Validade | `Path` | Atributos |
|---|---|---|---|---|
| `lux_access` | JWT de acesso | 15 min | `/` | `HttpOnly; SameSite=Strict; Secure` (produção) |
| `lux_refresh` | JWT de refresh | 7 dias | `/api/v1/auth` | idem; enviado **só** para as rotas de auth |

### CSRF
Com cookies de sessão, CSRF é a ameaça clássica (um site malicioso faz o navegador da vítima enviar
uma requisição autenticada). Defesas aplicadas:
1. `SameSite=Strict`: o navegador não envia o cookie em requisições originadas em outro site;
2. a API exige JSON (`Content-Type: application/json`), que um `<form>` HTML não consegue enviar sem
   um preflight CORS;
3. CORS restrito à origem do front (`allow_credentials=True` nunca combinado com `*`; a aplicação
   **recusa subir** em produção com `CORS_ORIGINS=*`).

### Ciclo de vida da sessão
```
login → família F (refresh R1) ──refresh──► R1 revogado, R2 emitido (replaced_by=R2)
                                 ──refresh──► R2 revogado, R3 emitido
reapresentar R1 (roubado)       ──► fora da janela de graça → REVOGA A FAMÍLIA F inteira → 401 refresh_token_reused
duas abas renovando juntas      ──► dentro de 10 s → 401 refresh_token_rotated (família preservada)
logout                          ──► revoga a família + access token na denylist (Redis) até expirar
troca de senha                  ──► revoga todas as famílias do usuário (test_password_change_..._ends_other_sessions)
desativação pelo admin          ──► revoga tudo + invalida o status em cache (efeito imediato)
```

### Senhas
- bcrypt com custo 12 (~200 ms), executado **em thread** para não travar o event loop;
- política: ≥ 10 caracteres com maiúscula, minúscula, número e símbolo; limite de 72 bytes (limite do
  bcrypt) validado com mensagem clara;
- nunca registradas em log, nunca devolvidas pela API (`test_register_creates_customer_and_never_returns_password`).

## 3. Autorização
- `Principal` (id + papel) montado a partir do JWT + status no Redis/Postgres: o papel efetivo vem do
  **banco**, então rebaixar um admin vale imediatamente.
- Dependências declarativas: `require_admin`, `get_principal`, `get_current_user`.
- Regras de negócio por papel no domínio puro (`ordering/domain.py`), não espalhadas por endpoints.
- **IDOR:** recursos de outro usuário respondem 404 (não confirmam a existência do id).

## 4. Entrada e saída
| Vetor | Controle |
|---|---|
| SQL injection | 100% de queries parametrizadas (ORM e `text()` com bind params); o SQL do analytics monta só fragmentos constantes |
| Validação | Pydantic com limites de tamanho em todo campo; `extra` ignorado; e-mail validado; `Decimal` com 2 casas |
| Upload | lê no máximo 5 MB em blocos de 256 KB (não confia no `Content-Length`); verifica **magic bytes** (não confia no `Content-Type`); decodifica com Pillow (`verify`) e rejeita imagens > 40 MP; **recodifica** para WebP, o que descarta metadados EXIF e payloads embutidos; nome do arquivo gerado no servidor |
| Cabeçalhos de resposta | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS em produção; o nginx adiciona **CSP** restritiva para a SPA |
| `X-Request-ID` vindo do cliente | aceito só se casar com `^[A-Za-z0-9._-]{8,64}$` (evita injeção em logs: `test_every_response_has_request_id_and_security_headers`) |
| IP real atrás de proxy | `X-Forwarded-For` só é confiado quando vem de `TRUSTED_PROXIES` (redes privadas); caso contrário, o rate limit por IP seria contornável |

## 5. Segredos e configuração
- A aplicação **recusa subir** em produção com `SECRET_KEY` padrão ou curta, com `BOOTSTRAP_ADMIN_TOKEN`
  curto, ou com CORS `*` (`test_production_refuses_insecure_defaults`).
- Segredos opcionais vazios (`""`) significam "desligado", não "inválido" (regressão encontrada ao
  testar o tutorial de deploy).
- Só um digest SHA-256 do `jti` do refresh token é persistido.
- `.env` fora do git; exemplos versionados (`.env.example`, `.env.prod.example`); em Kubernetes, Secret
  (com a recomendação de External Secrets/Vault).
- Container roda como usuário não-root; no k8s, `readOnlyRootFilesystem` e `allowPrivilegeEscalation: false`.

## 6. Disponibilidade como segurança
| Controle | Falha |
|---|---|
| Rate limit global | **aberto** (fail-open) se o Redis cair: degradar a proteção é melhor que derrubar o site |
| Rate limit de login/registro/refresh | **fechado** (fail-closed): sem Redis, autenticação responde 503 em vez de permitir brute force (`test_auth_limiter_fails_closed_when_redis_is_down`) |
| Statement timeout no Postgres (5 s) | uma query patológica não segura uma conexão para sempre |
| Load shedding (200 em voo por processo) | sobrecarga vira 503 rápido, e não latência infinita |

## 7. LGPD (proteção de dados pessoais)
Dados pessoais armazenados: nome, e-mail, telefone, endereço de entrega (no pedido), IP (só em logs).

| Princípio | Situação neste projeto | Próximo passo |
|---|---|---|
| Minimização | só o necessário para entregar um pedido | — |
| Direito de exclusão | usuário não é apagado (`ON DELETE RESTRICT` por causa do histórico fiscal) | rotina de **anonimização**: nome/e-mail/telefone substituídos, endereço removido dos pedidos antigos |
| Segurança | senhas com bcrypt, TLS, controle de acesso | criptografia de colunas sensíveis (por exemplo, PII cifrada com Fernet na aplicação) |
| Retenção | logs e tokens com retenção definida | política formal por tipo de dado |
| Residência | servidor em região brasileira no deploy recomendado | diretório de shards com região (estágio 6) |

## 8. Fora do escopo (conhecido)
2FA (TOTP), bloqueio de conta após N falhas (aqui é rate limit por conta, que não trava
o titular para sempre), verificação de e-mail, varredura de dependências no CI (Trivy/Dependabot são o
próximo passo natural do pipeline).
