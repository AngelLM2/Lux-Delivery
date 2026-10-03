FROM python:3.14-alpine AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip --no-cache-dir && \
    pip install --no-cache-dir --prefix=/deps -r requirements.txt

FROM python:3.14-alpine AS runtime
RUN addgroup --system app && adduser --system --ingroup app app
WORKDIR /app

COPY --from=builder /deps /usr/local
COPY --chown=app:app . .

USER app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH=/usr/local/bin:$PATH

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')" || exit 1

# Migrations são responsabilidade do serviço `migrate` no docker-compose.
# O CMD da api sobe apenas o servidor.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]