# Plan técnico · 001-infra-base

Alineado con `.specify/memory/constitution.md`, `docs/architecture.md`, `docs/infrastructure.md`, ADR-0001, ADR-0002, ADR-0006, ADR-0007 y los skills `infra-gcp`, `prisma-multitenant`, `nestjs-module` y `dashboard-ui`.

## 1. Monorepo (pnpm + Turborepo)

- `packages/config`: configuración compartida de TypeScript y ESLint.
- `packages/domain`: `TenantContext`, `DomainError`, `RejectionCode` y mensajes en español (`rejection-messages.es.ts`), generador UUID v7.
- `packages/rules`: librería pura de reglas (esqueleto con Vitest listo para spec 005).
- `packages/ui`: tokens CSS (`tokens.css`), `StatusBadge` y `Money`.
- `apps/api`: NestJS con TypeScript estricto, Prisma, `/health`, `/ready`, logger JSON estructurado, hook Sentry, filtro global de `DomainError`, `JobQueue` (`PgBossJobQueue` + `InMemoryJobQueue`).
- `apps/web`: Next.js App Router (`output: 'standalone'`), página de estado mínima en español y endpoint `/api/health`.

## 2. Base de datos y RLS

- Esquema Prisma en `apps/api/prisma/schema.prisma` con `Tenant` (tabla global SaaS) y `AuditLog` (tabla de negocio con `tenant_id` y RLS).
- Migración SQL inicial que habilita extensiones `vector` y `pgcrypto`, crea las tablas y aplica `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y política `tenant_isolation` sobre `audit_logs`.
- Helper `withTenant(ctx, fn)` que fija `app.tenant_id` con `set_config(..., true)` dentro de una transacción Prisma.
- Pruebas de integración `rls-isolation.int.spec.ts` y `rls-coverage.int.spec.ts` contra PostgreSQL real usando el rol `noah_app` (`NOBYPASSRLS`).

## 3. Contenedores, Terraform GCP y CI/CD

- Dockerfiles multi-stage (`node:22-slim`, usuario no root) para `apps/api` y `apps/web`.
- Terraform en `infra/bootstrap`, `infra/modules/{cloud-run-service,cloud-sql,storage,secrets}` y `infra/envs/{stg,prd}`.
- Workflows GitHub Actions: `ci.yml` (existente), `deploy-stg.yml` y `deploy-prd.yml`.
