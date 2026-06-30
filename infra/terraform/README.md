# infra/terraform

The AWS production target as Infrastructure-as-Code: ECS Fargate (api, workers,
web, ai-concierge) behind an ALB + WAF, RDS Postgres (pgvector), ElastiCache
Redis, S3, and Secrets Manager. `main.tf` is the skeleton with the intended
module layout; the MVP runs on Fly.io/Railway while this proves the scale path.
Never commit `*.tfstate` or `*.tfvars` with secrets.
