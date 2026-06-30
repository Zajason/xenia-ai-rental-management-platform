# docs/api

Generated API specs. The REST surface is documented by NestJS Swagger at the live
`/docs` endpoint and exported here as `openapi.json`. Asynchronous events are
documented as `asyncapi.yaml`, generated from `@xenia/event-contracts`. Generate
these in CI so they never go stale; the `@xenia/sdk` client is generated from
`openapi.json`.
