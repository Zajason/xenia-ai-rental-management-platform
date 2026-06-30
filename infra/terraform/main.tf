# Xenia AWS scale-target (skeleton). The MVP deploys to Fly.io/Railway; this is
# the reviewable production path. Fill in module bodies as you graduate.
#
# Target topology:
#   - VPC + private subnets
#   - ECS Fargate services: api, workers, web, ai-concierge (behind an ALB + WAF)
#   - RDS Postgres (pgvector) — multi-AZ
#   - ElastiCache Redis
#   - S3 (media, task photos, trace/audit archive)
#   - Secrets Manager (db creds, ANTHROPIC_API_KEY, provider keys)
#   - CloudWatch + OTLP export to a managed Grafana/Tempo

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "environment" {
  type    = string
  default = "production"
}

# module "network"  { source = "./modules/network" }
# module "database"  { source = "./modules/database" }
# module "redis"     { source = "./modules/redis" }
# module "ecs"       { source = "./modules/ecs" ... }
