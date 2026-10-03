// Anonymous menu browsing — the hottest, most cacheable path.
//   docker compose -f docker-compose.yml -f docker-compose.loadtest.yml run --rm k6 run /scripts/browse.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, pick } from './lib.js';

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 600,
      stages: [
        { target: Number(__ENV.PEAK_RPS || 400), duration: __ENV.RAMP || '30s' },
        { target: Number(__ENV.PEAK_RPS || 400), duration: __ENV.HOLD || '60s' },
        { target: 0, duration: '10s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:GET /products}': ['p(95)<250'],
    'http_req_duration{name:GET /categories}': ['p(95)<150'],
  },
};

export function setup() {
  const categories = http.get(`${API}/categories`).json().map((c) => c.id);
  const products = http.get(`${API}/products?limit=100`).json('items').map((p) => p.id);
  return { categories, products };
}

export default function (data) {
  const roll = Math.random();
  let res;
  if (roll < 0.35) {
    res = http.get(`${API}/categories`, { tags: { name: 'GET /categories' } });
  } else if (roll < 0.8) {
    const filter = Math.random() < 0.5 ? `&category_id=${pick(data.categories)}` : '';
    res = http.get(`${API}/products?limit=20${filter}`, { tags: { name: 'GET /products' } });
  } else {
    res = http.get(`${API}/products/${pick(data.products)}`, { tags: { name: 'GET /products/{id}' } });
  }
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(Math.random() * 0.2);
}
