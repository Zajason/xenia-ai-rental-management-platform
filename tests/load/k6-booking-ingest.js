// Load test for the booking-ingestion + conflict path — the hottest, most
// correctness-sensitive route. Run: k6 run tests/load/k6-booking-ingest.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<400'],
    checks: ['rate>0.99'],
  },
};

const BASE = __ENV.API_BASE_URL || 'http://localhost:4000';
const ORG = __ENV.ORG_ID || '00000000-0000-0000-0000-000000000000';
const UNIT = __ENV.UNIT_ID || '00000000-0000-0000-0000-000000000000';

export default function () {
  // Random far-future window to avoid overlap noise under load.
  const start = new Date(Date.now() + (1 + Math.random() * 365) * 86400000);
  const end = new Date(start.getTime() + 2 * 86400000);

  const res = http.post(
    `${BASE}/bookings/confirm`,
    JSON.stringify({ unitId: UNIT, checkIn: start.toISOString(), checkOut: end.toISOString() }),
    { headers: { 'Content-Type': 'application/json', 'x-org-id': ORG } },
  );

  // Either created (200/201) or a clean conflict (409) is acceptable.
  check(res, { 'handled cleanly': (r) => [200, 201, 409].includes(r.status) });
  sleep(0.2);
}
