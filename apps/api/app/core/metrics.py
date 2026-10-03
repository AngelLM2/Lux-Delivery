from prometheus_client import Counter, Gauge, Histogram

# Route templates (e.g. /api/v1/orders/{order_id}) keep label cardinality bounded.
HTTP_REQUESTS = Counter("lux_http_requests_total", "HTTP requests processed", ["method", "route", "status"])
HTTP_LATENCY = Histogram(
    "lux_http_request_duration_seconds",
    "HTTP request latency",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)
HTTP_IN_PROGRESS = Gauge("lux_http_requests_in_progress", "HTTP requests in flight")

LOAD_SHED = Counter("lux_load_shed_total", "Requests rejected by the in-flight limit (503)")
RATE_LIMITED = Counter("lux_rate_limited_total", "Requests rejected by the rate limiter", ["scope"])
CACHE_REQUESTS = Counter("lux_cache_requests_total", "Cache lookups", ["namespace", "result"])

ORDERS_CREATED = Counter("lux_orders_created_total", "Orders created")
ORDER_TRANSITIONS = Counter("lux_order_status_transitions_total", "Order status transitions", ["to"])
IDEMPOTENT_REPLAYS = Counter("lux_idempotent_replays_total", "Requests answered from an idempotency key")

SSE_CONNECTIONS = Gauge("lux_sse_connections", "Open server-sent-event connections")
DB_POOL_CHECKED_OUT = Gauge("lux_db_pool_checked_out", "DB connections currently checked out")

# Worker metrics (exposed by the worker process on its own port)
OUTBOX_PUBLISHED = Counter("lux_outbox_published_total", "Outbox events relayed to the stream")
OUTBOX_PENDING = Gauge("lux_outbox_pending", "Outbox events waiting to be relayed")
EVENTS_CONSUMED = Counter("lux_events_consumed_total", "Stream events consumed", ["consumer", "result"])
