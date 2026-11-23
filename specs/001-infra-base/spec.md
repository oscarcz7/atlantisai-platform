# Spec 001 · Base técnica e infraestructura

- **Rama:** `feat/001-infra-base`
- **Fase:** 0 (Base técnica)
- **Estado:** Aprobada para implementación
- **Origen:** [`specs-input/001-infra-base.md`](../../specs-input/001-infra-base.md)

## Objetivo

Establecer la base técnica del monorepo, el aislamiento multi-tenant garantizado desde PostgreSQL (Row-Level Security), la infraestructura como código en Google Cloud y los pipelines de CI/CD para los ambientes local, staging y producción.

## Historias de usuario

1. **Desarrollo local rápido:** Como desarrollador, quiero clonar el repositorio y levantar todo localmente con pocos comandos para empezar a trabajar en minutos.
2. **Calidad automática en PR:** Como desarrollador, quiero que cada pull request ejecute revisión de estilo, tipos y pruebas automáticamente.
3. **Despliegue continuo a staging:** Como equipo, queremos que todo cambio fusionado en `main` aplique migraciones y se despliegue solo en staging.
4. **Despliegue controlado a producción:** Como responsable, quiero desplegar a producción solo mediante una versión etiquetada (`vX.Y.Z`) con aprobación manual y posibilidad de rollback.
5. **Aislamiento multi-tenant desde BD:** Como responsable de seguridad, quiero que PostgreSQL impida que un edificio lea o escriba datos de otro aunque exista un error en el código.
6. **Observabilidad y control de costos:** Como responsable, quiero logs estructurados, errores en Sentry, alertas de disponibilidad y presupuesto mensual.

## Criterios de aceptación

- [ ] Con `docker compose up -d && pnpm install && pnpm dev`, `apps/api` y `apps/web` levantan en local y responden en `/health` (y `/ready` en API).
- [ ] Un pull request ejecuta `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:int` en CI.
- [ ] Fusionar en `main` construye imágenes, ejecuta `prisma migrate deploy` como Cloud Run Job y despliega en staging.
- [ ] Un tag `vX.Y.Z` despliega a producción tras aprobación en el environment `production` de GitHub.
- [ ] `rls-isolation.int.spec.ts` demuestra con dos tenants que consultar sin filtro `WHERE` como Tenant A nunca devuelve filas de Tenant B.
- [ ] `rls-coverage.int.spec.ts` falla si cualquier tabla con columna `tenant_id` en el esquema `public` carece de RLS habilitado, forzado y política activa.
- [ ] No existen secretos en el repositorio ni en el estado de Terraform.
- [ ] Existen módulos Terraform para Cloud Run, Cloud SQL (PostgreSQL 16 + `vector`), Cloud Storage, Secret Manager, Artifact Registry, WIF, uptime checks y presupuestos.

## Fuera de alcance

Funcionalidades de negocio (auth, configurador, catastro, reservas), pantallas operativas, integración con lectores Hikvision y canal WhatsApp.
