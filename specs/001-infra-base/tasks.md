# Tareas · 001-infra-base

1. [x] Inicializar repositorio Git en `noah-platform/` y crear rama `feat/001-infra-base`.
2. [x] Crear paquetes compartidos: `packages/config`, `packages/domain`, `packages/rules`, `packages/ui`.
3. [x] Crear `apps/api` (NestJS) con `/health`, `/ready`, filtro `DomainError`, logger JSON y soporte Sentry.
4. [x] Configurar Prisma (`Tenant`, `AuditLog`), migración SQL con `pgvector` y RLS forzado, y helper `withTenant`.
5. [x] Implementar `JobQueue` con `PgBossJobQueue`, `InMemoryJobQueue` y job de ejemplo.
6. [x] Implementar pruebas unitarias y pruebas de integración RLS (`rls-isolation.int.spec.ts`, `rls-coverage.int.spec.ts`).
7. [x] Crear `apps/web` (Next.js App Router standalone) con página de estado y `/api/health`.
8. [x] Crear Dockerfiles multi-stage para `apps/api` y `apps/web`.
9. [x] Crear infraestructura Terraform en `infra/bootstrap`, `infra/modules/` e `infra/envs/{stg,prd}`.
10. [x] Crear workflows `.github/workflows/deploy-stg.yml` y `.github/workflows/deploy-prd.yml`.
11. [x] Ejecutar `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm typecheck` y `pnpm test` (todos en verde).
