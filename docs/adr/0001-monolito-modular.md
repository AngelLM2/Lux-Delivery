# ADR-0001 — Monólito modular em vez de microserviços

- **Status:** aceito (2026-10-03)
- **Contexto:** um time pequeno, um domínio coeso (catálogo → pedido → notificação) e transações que
  cruzam catálogo e pedidos (validar preço e disponibilidade ao criar o pedido). O código v2 era
  organizado por camada técnica (`routers/`, `services/`, `repositories/`), sem fronteiras de domínio.
- **Decisão:** um único deploy (API + worker), organizado em **módulos por bounded context**
  (`identity`, `catalog`, `ordering`, `notifications`, `analytics`, `realtime`). Cada módulo é dono das
  suas tabelas; outro módulo só o acessa pela interface pública (`catalog/public.py`); serviços lançam
  erros de domínio e não conhecem HTTP.
- **Alternativas:**
  - *Microserviços desde o início:* rede, consistência eventual e deploy distribuído antes de existir
    o problema. Monólito distribuído quase garantido sem fronteiras maduras.
  - *Monólito em camadas (v2):* simples, mas tudo pode chamar tudo, e extrair um domínio depois exige
    desembaraçar o código inteiro.
- **Consequências:** (+) transações locais, um deploy, refatoração barata, testes rápidos.
  (+) A extração futura fica mecânica: trocar a implementação de `public.py` por um cliente de rede
  (estágio 6). (−) A disciplina de fronteira depende de revisão; uma checagem automatizada de imports
  (*fitness tests*, por exemplo com `import-linter`) é o próximo passo.
