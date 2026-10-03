// Shared helpers for the k6 scenarios.
import http from 'k6/http';
import { check } from 'k6';

export const BASE = __ENV.BASE_URL || 'http://web';
export const API = `${BASE}/api/v1`;
export const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function uuid() {
  // RFC4122 v4 (good enough for idempotency keys in a load test)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Bearer tokens via the OAuth2 password endpoint (the browser uses cookies; k6 does not need to).
export function token(email, password) {
  const res = http.post(`${API}/auth/token`, { username: email, password }, { tags: { name: 'POST /auth/token' } });
  check(res, { 'login 200': (r) => r.status === 200 });
  return res.json('access_token');
}

export function authHeaders(accessToken, extra = {}) {
  return { headers: { ...JSON_HEADERS, Authorization: `Bearer ${accessToken}`, ...extra } };
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
