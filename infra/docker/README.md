# infra/docker

Production Dockerfiles, built from the repo root so the pnpm workspace is in
context. One per deployable: `Dockerfile.api`, `Dockerfile.workers`,
`Dockerfile.web`, `Dockerfile.ai`. These are deliberately simple; tighten with a
proper lockfile copy and pruned `pnpm deploy` outputs before production.
