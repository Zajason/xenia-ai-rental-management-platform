# infra/

Everything needed to run Xenia locally and in the cloud.

- **compose/** — the local development stack (`docker-compose.yml`): Postgres
  (with pgvector), Redis, and the OpenTelemetry collector + Grafana/Tempo/Loki
  /Prometheus. `pnpm infra:up` starts it.
- **docker/** — production Dockerfiles for `api`, `workers`, `web`, and
  `ai-concierge`.
- **terraform/** — the AWS scale-target as reviewable IaC: ECS Fargate services,
  RDS Postgres, ElastiCache Redis, S3, and Secrets Manager. The MVP can deploy to
  Fly.io/Railway; this proves the production path.

The golden rule: local dev and CI both stand up the same Compose stack, so "works
on my machine" means "works in CI".
