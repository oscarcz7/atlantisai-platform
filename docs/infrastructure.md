# Infraestructura en Google Cloud

## Proyectos y ambientes

| Ambiente | Proyecto de Google Cloud | Despliegue |
| --- | --- | --- |
| Desarrollo local | — | `docker compose` + `pnpm dev` |
| Staging | `noah-platform-stg` | Automático al fusionar en `main` |
| Producción | `noah-platform-prd` | Tag `vX.Y.Z` con aprobación manual en GitHub |

Un proyecto adicional `noah-platform-ops` guarda el estado de Terraform y la identidad de GitHub Actions. Ajusten los nombres si ya están tomados (los IDs de proyecto son globales).

## Recursos por ambiente

| Recurso | Servicio | Configuración inicial (staging / producción) |
| --- | --- | --- |
| API | Cloud Run `api` | 1 vCPU, 512 MiB; mín. 0 / 1 instancia; CPU siempre asignada en producción (colas) |
| Dashboard | Cloud Run `web` | 1 vCPU, 512 MiB; mín. 0 instancias |
| Base de datos | Cloud SQL PostgreSQL 16 | Instancia pequeña de núcleo compartido / dedicada pequeña; respaldos diarios y recuperación a un punto en el tiempo (7 días) en producción |
| Archivos | Cloud Storage | Bucket privado por ambiente, acceso uniforme, sin acceso público |
| Secretos | Secret Manager | `DATABASE_URL`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `SENTRY_DSN`, y en Fase 3 `WA_*` y `LLM_API_KEY` |
| Imágenes | Artifact Registry | Repositorio Docker `noah` en `us-east1` |
| Identidades | Cuentas de servicio | `api-runtime`, `web-runtime`, `deployer` con permisos mínimos |
| Dominio | Cloud Run domain mapping o balanceador | `app.<dominio>` → web, `api.<dominio>` → api |
| Presupuesto | Billing budget | Alertas al 50 %, 90 % y 100 % del presupuesto mensual |

Revisen los costos en la calculadora de precios de Google Cloud con estos tamaños antes de crear producción.

## Red y conexión a la base de datos

- Cloud Run se conecta a Cloud SQL con el conector integrado (socket Unix) y la cuenta de servicio `api-runtime` con el rol Cloud SQL Client.
- Usuario de base de datos de la aplicación sin `BYPASSRLS`; un usuario separado para migraciones.
- `CREATE EXTENSION IF NOT EXISTS vector;` en la primera migración.

## CI/CD

1. Pull request: `lint`, `typecheck`, `test`, `test:int` (PostgreSQL en contenedor de servicio).
2. Fusión a `main`: construir imágenes `api` y `web`, subir a Artifact Registry, ejecutar `prisma migrate deploy` como Cloud Run Job, desplegar a staging.
3. Tag `vX.Y.Z`: mismas imágenes promovidas a producción tras aprobación manual (GitHub Environment `production`).
4. Autenticación de GitHub Actions con Workload Identity Federation; sin claves JSON.

## Terraform (`infra/`)

```
infra/
  bootstrap/            # una vez: bucket de estado, WIF, cuenta deployer
  modules/
    cloud-run-service/
    cloud-sql/
    storage/
    secrets/
  envs/
    stg/
    prd/
```

## Observabilidad

- Logs estructurados en JSON hacia Cloud Logging.
- Errores en Sentry (api y web).
- Uptime checks sobre `/health` de api y web con alertas por correo.
- Desde Fase 2: alertas de gateway y lectores; desde Fase 3: webhook de WhatsApp y cola de mensajes.
