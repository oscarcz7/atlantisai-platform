# 001 · Base técnica e infraestructura

## Para /speckit.specify

Necesitamos la base técnica del proyecto para que el equipo pueda desarrollar, probar y desplegar la plataforma de gestión residencial desde el primer día, con tres ambientes (local, staging y producción) y aislamiento de datos entre edificios garantizado desde la base de datos.

Usuarios: el equipo de desarrollo y quien opera la plataforma.

Historias:
1. Como desarrollador, quiero clonar el repositorio y levantar todo localmente con pocos comandos, para empezar a trabajar en minutos.
2. Como desarrollador, quiero que cada pull request ejecute automáticamente revisión de estilo, tipos y pruebas, para no romper nada sin darme cuenta.
3. Como equipo, queremos que todo cambio fusionado en la rama principal se despliegue solo en staging, para probar con datos reales sin riesgo.
4. Como responsable, quiero desplegar a producción con una aprobación explícita y poder volver a la versión anterior.
5. Como responsable de seguridad, quiero que la base de datos impida por sí misma que un edificio vea datos de otro, aunque haya un error en el código.
6. Como responsable, quiero ver errores, disponibilidad y costos, con alertas cuando algo falla o el gasto se acerca al presupuesto.

Criterios de aceptación:
- Con el repositorio recién clonado, una persona levanta API y dashboard en local siguiendo el README, y ambos responden en su ruta de salud.
- Un pull request con un error de tipos o una prueba fallida no puede fusionarse.
- Al fusionar en la rama principal, staging queda actualizado sin pasos manuales y las migraciones de base de datos se aplican antes de la nueva versión.
- Producción solo se actualiza con una versión etiquetada y la aprobación de una persona autorizada.
- Existe una prueba automática que, con dos edificios de prueba, demuestra que consultar como uno no devuelve datos del otro, incluso sin filtro en la consulta.
- Existe una prueba que falla si alguna tabla con identificador de edificio no tiene política de aislamiento.
- No hay secretos en el repositorio ni en los registros.
- Hay alertas configuradas por caída de servicio y por presupuesto mensual.

Fuera de alcance: funcionalidades de negocio, pantallas, integración con lectores y WhatsApp.

## Para /speckit.plan

Respetar `AGENTS.md`, la constitución, `docs/architecture.md`, `docs/infrastructure.md`, los ADR 0001, 0002, 0006 y 0007 y el skill `infra-gcp`.

- Monorepo pnpm + Turborepo con `apps/api` (NestJS), `apps/web` (Next.js), `packages/domain`, `packages/rules`, `packages/ui`, `packages/config`. Ya existen los archivos raíz (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `docker-compose.yml`, `.env.example`, `ci.yml`): completarlos, no reemplazarlos.
- Prisma con el modelo `Tenant` y un modelo de ejemplo con `tenant_id`, migración con RLS (`ENABLE` + `FORCE` + política), helper `withTenant` y usuario de aplicación sin `BYPASSRLS`.
- Endpoints `/health` y `/ready` en api; página de estado mínima en web.
- Dockerfiles multi-stage para api y web.
- Terraform: `infra/bootstrap` (bucket de estado, Workload Identity Federation, cuenta `deployer`) y `infra/envs/stg` con Cloud Run, Cloud SQL (PostgreSQL 16, extensión `vector`), Cloud Storage, Secret Manager y Artifact Registry. `envs/prd` como copia parametrizada.
- GitHub Actions: `ci.yml` (PR), `deploy-stg.yml` (main), `deploy-prd.yml` (tag + environment con aprobación). Migraciones como Cloud Run Job.
- Sentry en api y web; logs JSON; uptime checks; presupuesto con alertas.
- pg-boss inicializado detrás de la interfaz `JobQueue`, con un job de ejemplo.
