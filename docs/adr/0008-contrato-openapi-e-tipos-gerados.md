# ADR-0008 — Tipos do front gerados do OpenAPI, com checagem de drift no CI

- **Status:** aceito
- **Contexto:** a v2 tinha tipos escritos à mão no front, e eles divergiram da API: rotas de categoria
  inexistentes (`/categories/post`), campo `actualy_password` que a API ignorava. São bugs que nenhum
  teste do back nem do front isolados pegaria.
- **Decisão:** a API exporta `openapi.json` (`python -m app.scripts.export_openapi`); o front gera
  `schema.d.ts` com `openapi-typescript` e só usa esses tipos. O job `contract` do CI regenera os dois e
  falha com `git diff` não vazio.
- **Alternativas:** cliente gerado completo (mais acoplamento ao gerador); tRPC/GraphQL (troca de
  stack); testes de contrato Pact (mais adequados entre serviços, estágio 6).
- **Consequências:** (+) uma mudança incompatível na API quebra o build do front no mesmo PR.
  (−) Um passo a mais ao alterar a API (rodar o export e o `gen:api`).
