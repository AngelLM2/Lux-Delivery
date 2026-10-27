# Documentação do Lux Delivery

## Trilhas de leitura

| Tempo | Leia |
|---|---|
| **5 min** | [README do projeto](../README.pt-BR.md) → [02 — Arquitetura](02-arquitetura.md) |
| **30 min** (visão de system design) | [01 — Requisitos e capacidade](01-requisitos-e-capacidade.md) → [02 — Arquitetura](02-arquitetura.md) → [07 — Escalabilidade](07-escalabilidade/README.md) |
| **Deep dive** | [03 — Modelagem](03-modelagem-de-dados.md) → [06 — Concorrência](06-concorrencia-e-consistencia.md) → [09 — Testes de carga](09-testes-de-carga.md) → [08 — Federação e sharding](08-federacao-sharding-e-microservicos.md) |

## Índice

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Requisitos e capacidade](01-requisitos-e-capacidade.md) | requisitos funcionais e não funcionais, SLOs, modelo de carga com as contas de 10 a 10 M de usuários |
| 02 | [Arquitetura](02-arquitetura.md) | C4 (contexto, containers, componentes), monólito modular, ciclo de vida da request, fluxos em diagramas de sequência |
| 03 | [Modelagem de dados](03-modelagem-de-dados.md) | ERD, dicionário, decisões (NUMERIC, BIGINT, snapshot, soft delete), cada índice e sua query, `EXPLAIN`, retenção, evolução |
| 04 | [API](04-api.md) | convenções (erros, paginação keyset, idempotência, cache, rate limit), endpoints, eventos SSE |
| 05 | [Segurança](05-seguranca.md) | STRIDE, cookies vs Bearer, CSRF, rotação de refresh, uploads, segredos, LGPD |
| 06 | [Concorrência e consistência](06-concorrencia-e-consistencia.md) | idempotência, locks, outbox, consumers idempotentes, cache após commit, sagas |
| 07 | [Escalabilidade (tutorial)](07-escalabilidade/README.md) | estágios 0 → 6: 1–10, 10–100, 100–1k, 1k–10k, 10k–100k, 100k–1M, 1M–10M+ |
| 08 | [Federação, sharding e microserviços](08-federacao-sharding-e-microservicos.md) | replicação vs particionamento vs federação vs sharding, escolha da chave, sagas, GraphQL Federation |
| 09 | [Testes de carga](09-testes-de-carga.md) | metodologia, 4 gargalos encontrados e corrigidos, 1 vs 3 réplicas, o que satura depois |
| 10 | [Observabilidade e runbooks](10-observabilidade-e-runbooks.md) | métricas, SLIs/SLOs, alertas, runbooks, profiling em produção |
| 11 | [Backend Deep-Dive](11-backend-architecture-deep-dive.md) | arquitetura modular, Transactional Outbox, concorrência SKIP LOCKED e anti-IDOR |
| — | [ADRs](adr/README.md) | 10 decisões de arquitetura com alternativas e consequências |

## Convenções desta documentação
- Números são **medidos** quando a fonte é citada (testes de carga, `EXPLAIN`, tamanhos de tabela) e
  **estimados** quando aparecem como "ordem de grandeza" (custos de nuvem).
- Toda afirmação de comportamento cita o teste que a prova (`test_…`) ou o arquivo onde está implementada.
- Diagramas em Mermaid (renderizados pelo GitHub).
