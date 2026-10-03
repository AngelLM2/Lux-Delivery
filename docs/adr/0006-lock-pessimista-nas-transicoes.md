# ADR-0006 — Lock pessimista (`SELECT … FOR UPDATE`) nas transições de status

- **Status:** aceito
- **Contexto:** dois atendentes podem agir no mesmo pedido ao mesmo tempo ("confirmar" e "cancelar").
  Sem controle, as duas transições passam na validação e geram uma história impossível.
- **Decisão:** a transição trava a linha do pedido (`FOR UPDATE OF orders`), revalida a máquina de
  estados contra o status atual e grava status + tracking + outbox na mesma transação.
- **Alternativas:** locking otimista com coluna `version` (`UPDATE … WHERE version = :v`, 409 se mudou).
  Melhor quando a "transação" inclui tempo humano (formulário aberto por minutos) ou quando a disputa é
  rara e retry é barato. Aqui a transação dura milissegundos e a resposta certa sem retry é mais simples
  para o cliente.
- **Consequências:** (+) histórias sempre seriais, provadas por um teste de concorrência real. (−) Lock
  de linha segurado durante a transação, por isso ela é curta (sem I/O externo dentro).
