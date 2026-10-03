// Authenticated write path: place orders (with idempotency keys), read them back, admin moves them.
// Writes hit Postgres (row inserts + outbox) and exercise the worker pipeline end to end.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, authHeaders, pick, token, uuid } from './lib.js';

const CUSTOMERS = Number(__ENV.CUSTOMERS || 20);

export const options = {
  scenarios: {
    customers: {
      executor: 'constant-arrival-rate',
      exec: 'customer',
      rate: Number(__ENV.ORDERS_RPS || 40),
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: 50,
      maxVUs: 300,
    },
    kitchen: {
      executor: 'constant-arrival-rate',
      exec: 'admin',
      rate: Number(__ENV.ADMIN_RPS || 10),
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:POST /orders}': ['p(95)<400'],
    'http_req_duration{name:GET /orders}': ['p(95)<250'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const admin = token(__ENV.ADMIN_EMAIL || 'admin@lux.dev', __ENV.ADMIN_PASSWORD || 'Admin@12345');
  const customers = [];
  for (let i = 0; i < CUSTOMERS; i++) {
    const email = `k6-${i}@loadtest.lux.dev`;
    http.post(`${API}/auth/register`, JSON.stringify({ full_name: `K6 ${i}`, email, password: 'Carga@123456' }), {
      headers: { 'Content-Type': 'application/json' },
      responseCallback: http.expectedStatuses(201, 409), // 409: already registered by a previous run
    });
    customers.push(token(email, 'Carga@123456'));
  }
  const products = http
    .get(`${API}/products?limit=100`)
    .json('items')
    .filter((p) => p.is_available)
    .map((p) => p.id);
  return { admin, customers, products };
}

export function customer(data) {
  const auth = data.customers[__VU % data.customers.length];
  const items = [{ product_id: pick(data.products), quantity: 1 + Math.floor(Math.random() * 2) }];
  if (Math.random() < 0.5) items.push({ product_id: pick(data.products), quantity: 1 });
  const key = uuid();
  const body = JSON.stringify({ delivery_address: 'Rua do Teste de Carga, 42', items });
  const created = http.post(`${API}/orders`, body, { ...authHeaders(auth, { 'Idempotency-Key': key }), tags: { name: 'POST /orders' } });
  check(created, { 'order 201': (r) => r.status === 201 });

  // 10% of clients retry (flaky network): must be a replay, never a duplicate.
  if (Math.random() < 0.1) {
    const replay = http.post(`${API}/orders`, body, { ...authHeaders(auth, { 'Idempotency-Key': key }), tags: { name: 'POST /orders (retry)' } });
    check(replay, { 'retry is replay': (r) => r.status === 200 && r.headers['Idempotent-Replayed'] === 'true' });
  }
  const list = http.get(`${API}/orders?limit=10`, { ...authHeaders(auth), tags: { name: 'GET /orders' } });
  check(list, { 'list 200': (r) => r.status === 200 });
  sleep(0.1);
}

const NEXT = { created: 'confirmed', confirmed: 'preparing', preparing: 'out_for_delivery', out_for_delivery: 'delivered' };

export function admin(data) {
  const status = pick(['created', 'confirmed', 'preparing', 'out_for_delivery']);
  const board = http.get(`${API}/orders?status=${status}&limit=20`, { ...authHeaders(data.admin), tags: { name: 'GET /orders?status' } });
  check(board, { 'board 200': (r) => r.status === 200 });
  const orders = board.json('items') || [];
  if (orders.length) {
    const order = pick(orders);
    const moved = http.patch(
      `${API}/orders/${order.id}/status`,
      JSON.stringify({ status: NEXT[order.status] }),
      {
        ...authHeaders(data.admin),
        tags: { name: 'PATCH /orders/{id}/status' },
        responseCallback: http.expectedStatuses(200, 409),
      },
    );
    // 409 is legitimate under concurrency: another kitchen VU moved it first (row lock + re-validation).
    check(moved, { 'transition 200/409': (r) => r.status === 200 || r.status === 409 });
  }
}
