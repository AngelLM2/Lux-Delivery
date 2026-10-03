# ADR-0009 — Um processo uvicorn por container + load shedding

- **Status:** aceito
- **Contexto:** Python executa um núcleo por processo (GIL). O teste de carga mostrou que uma réplica
  satura a ~400 RPS e que, sem limite, a fila faz a latência ir de milissegundos a 27 s.
- **Decisão:** um processo por container (escala = réplicas no compose/k8s); `LoadShedMiddleware` recusa
  com 503 + `Retry-After` acima de 200 requisições em voo por processo; o pool de banco esgotado também
  vira 503 (não 500); o HPA mira 65% de CPU.
- **Alternativas:** `--workers N` por container (precisa do modo multiprocess do Prometheus, e o
  orquestrador enxerga menos); gunicorn com timeouts (não limita a fila em asyncio).
- **Consequências:** (+) latência limitada sob sobrecarga, métricas simples, falhas pequenas. (−) Mais
  containers para a mesma CPU; o limite de 200 precisa ser recalibrado se o perfil de latência mudar.
