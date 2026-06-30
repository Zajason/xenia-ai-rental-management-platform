# tests/load

k6 load scripts. `k6-booking-ingest.js` hammers the booking-confirm + conflict
path (the hottest, correctness-sensitive route) and asserts p95 latency and that
every response is either a clean create or a clean 409. Publish results in the
README to show the system holds under concurrency.
