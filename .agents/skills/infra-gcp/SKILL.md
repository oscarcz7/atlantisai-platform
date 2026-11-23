---
name: infra-gcp
description: Cómo crear o modificar la infraestructura en Google Cloud con Terraform y los pipelines de GitHub Actions (Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Artifact Registry, Workload Identity Federation, Docker, docker compose local). Úsalo siempre que una tarea toque infra/, .github/workflows/, Dockerfiles, variables de entorno, secretos, despliegues o el entorno local, aunque sea un cambio pequeño.
---

# Infraestructura en Google Cloud

## Antes de empezar
Lee `docs/infrastructure.md` y los ADR 0006 y 0007.

## Reglas
- Todo recurso de nube se declara en Terraform (`infra/`). Nada se crea a mano en la consola salvo el arranque descrito en `GETTING_STARTED.md`.
- Un módulo por tipo de recurso en `infra/modules/`; los ambientes (`envs/stg`, `envs/prd`) solo componen módulos y fijan variables.
- Estado remoto en el bucket del proyecto `ops`, con bloqueo.
- Permisos mínimos: cada servicio con su propia cuenta de servicio; nunca el rol Editor ni Owner para aplicaciones.
- Secretos solo en Secret Manager; Terraform crea el secreto, el valor se carga fuera de Terraform (no en el estado).
- GitHub Actions se autentica con Workload Identity Federation; prohibido subir claves JSON.
- Región `us-east1` salvo decisión documentada.
- Etiquetas en todos los recursos: `app=noah-platform`, `env=<stg|prd>`, `managed_by=terraform`.

## Docker
- Imágenes multi-stage con `node:22-slim`; usuario no root; `pnpm deploy --prod` para copiar solo dependencias de producción.
- `api` escucha en `$PORT` y expone `/health` (vivo) y `/ready` (base de datos accesible).
- `web` con `output: 'standalone'` de Next.js.

## Base de datos
- Migraciones con `prisma migrate deploy` ejecutadas como Cloud Run Job antes de desplegar la nueva revisión.
- Usuario de la aplicación sin `BYPASSRLS`; usuario de migraciones separado.

## Local
- `docker-compose.yml` con `pgvector/pgvector:pg16` y un bucket emulado si se necesita.
- `.env.example` documenta cada variable; `.env` nunca se versiona.

## Checklist
- [ ] `terraform fmt` y `terraform validate` sin errores
- [ ] `terraform plan` revisado en el pull request
- [ ] Sin secretos en código, estado ni logs
- [ ] `docs/infrastructure.md` actualizado si cambió la topología
