# @xenia/config

Shared tooling presets so every package is configured identically. Currently
exports tsconfig bases for the three runtimes:

- `tsconfig/base.json` — libraries (NodeNext, strict).
- `tsconfig/nest.json` — the NestJS API (CommonJS + decorators).
- `tsconfig/next.json` — the Next.js apps (bundler resolution, JSX).

Add prettier/eslint flat-config presets here as the project grows.
