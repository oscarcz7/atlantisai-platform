# Guía de arranque del proyecto

Esta guía lleva al equipo desde cero hasta tener la Fase 0 (base técnica) en marcha con Spec Kit en Antigravity y Google Cloud. Síganla en orden; cada paso indica cómo verificar que quedó bien.

**Resultado al terminar:** repositorio en GitHub con Spec Kit y el contexto del proyecto, Antigravity leyendo las reglas y skills, proyectos de Google Cloud creados, y la spec `001-infra-base` lista para implementarse.

---

## Paso 1 · Cuentas y accesos

| Qué | Para qué | Responsable |
| --- | --- | --- |
| Organización o cuenta de GitHub de la empresa | Repositorio, CI/CD, aprobaciones | Líder técnico |
| Cuenta de facturación de Google Cloud con tarjeta corporativa | Proyectos de staging y producción | Gerencia |
| Cuenta de Sentry (plan gratuito para empezar) | Errores de api y web | Líder técnico |
| Dominio (por ejemplo `plataforma-noah.com`) | `app.` y `api.` | Gerencia |
| Antigravity instalado por cada desarrollador | Desarrollo con agentes | Cada desarrollador |

## Paso 2 · Software en cada equipo

| Herramienta | Versión | Verificar con |
| --- | --- | --- |
| Git | reciente | `git --version` |
| Node.js | 22 LTS | `node -v` |
| pnpm (vía corepack) | 9.x | `corepack enable && pnpm -v` |
| Docker Desktop (o Docker Engine) | reciente | `docker compose version` |
| uv (gestor de Python, lo usa Spec Kit) | reciente | `uv --version` |
| Google Cloud CLI | reciente | `gcloud --version` |
| Terraform | ≥ 1.6 | `terraform -version` |
| Antigravity | IDE ≥ 2.0 o CLI ≥ 1.0 (requisito de la integración de Spec Kit) | Menú «Acerca de» o `agy --version` |

Instalación de uv: https://docs.astral.sh/uv/ · Google Cloud CLI: https://cloud.google.com/sdk/docs/install

## Paso 3 · Instalar Spec Kit

1. Elijan la última versión estable en https://github.com/github/spec-kit/releases y anoten el tag (por ejemplo `vX.Y.Z`). Usen siempre ese mismo tag en todo el equipo.
2. Instalen la CLI:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify --help
```

3. Anoten el tag usado en `docs/adr/` o en el README para que todos usen la misma versión.

## Paso 4 · Crear el repositorio e inicializar Spec Kit

El orden importa: primero Spec Kit, después este paquete, para que nuestra constitución reemplace la plantilla vacía.

```bash
mkdir noah-platform && cd noah-platform
git init -b main

# Inicializar Spec Kit con la integración de Antigravity
specify init --here --ai agy
```

Si su versión de Spec Kit no acepta `--ai agy` en `init`, inicialicen sin agente y agreguen la integración:

```bash
specify init --here
specify integration install agy
```

**Verificar:** existen `.specify/` (plantillas, scripts y `memory/constitution.md`) y `.agents/skills/speckit-*`.

## Paso 5 · Copiar este paquete encima

Descompriman `noah-starter.zip` y copien su contenido en la raíz del repositorio, incluidas las carpetas ocultas (`.agents`, `.specify`, `.github`), aceptando reemplazar archivos.

```bash
# desde la carpeta donde descomprimieron el zip
cp -R noah-starter/. /ruta/a/noah-platform/
cd /ruta/a/noah-platform
```

**Verificar:**
- `.specify/memory/constitution.md` empieza con «Constitución del proyecto — Plataforma de Gestión Residencial».
- `.agents/skills/` contiene los skills `speckit-*` y los 8 del proyecto (`nestjs-module`, `prisma-multitenant`, `reglas-reservas`, `dashboard-ui`, `infra-gcp`, `hikvision-gateway`, `whatsapp-canal`, `agentes-ia`).
- Copien también el Manual de NOAH (`MANUAL_ACTUALIZADO.pdf`) en `docs/source/` como referencia.

Primer commit y subida a GitHub:

```bash
git add .
git commit -m "chore: bootstrap repository with spec kit and project context"
git remote add origin git@github.com:<org>/noah-platform.git
git push -u origin main
```

## Paso 6 · Configurar GitHub

1. **Protección de `main`:** Settings → Branches → regla para `main`: requerir pull request, requerir el check `CI / checks`, sin push directo.
2. **Environments:** Settings → Environments → crear `staging` y `production`. En `production`, agregar revisores obligatorios.
3. **Variables** (se completan después del bootstrap de Terraform en la spec 001): `GCP_PROJECT_STG`, `GCP_PROJECT_PRD`, `GCP_REGION=us-east1`, `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`.

**Verificar:** un pull request de prueba muestra el check de CI (puede pasar vacío mientras no existan apps).

## Paso 7 · Preparar Antigravity

1. Abran la carpeta del repositorio en Antigravity.
2. Pregunten al agente: «¿Cuáles son las reglas obligatorias de este proyecto y qué skills tienes disponibles?».
   - Debe mencionar el multi-tenant con RLS, configuración en lugar de código, el LLM interpreta y el código decide, y listar los skills.
   - Si no menciona las reglas, agreguen una regla de workspace en la configuración de Antigravity que indique: «Lee siempre `AGENTS.md` y `.specify/memory/constitution.md` antes de cualquier tarea».
3. Verifiquen que los comandos `/speckit.*` aparecen disponibles.

## Paso 8 · Google Cloud: arranque manual mínimo

Lo único que se hace a mano es crear los proyectos y habilitar APIs. Todo lo demás lo crea Terraform en la spec 001.

```bash
gcloud auth login
gcloud billing accounts list    # anotar el ID de la cuenta de facturación

# Ajusten los IDs si ya existen (son globales)
for P in noah-platform-ops noah-platform-stg noah-platform-prd; do
  gcloud projects create $P
  gcloud billing projects link $P --billing-account=XXXXXX-XXXXXX-XXXXXX
done

for P in noah-platform-stg noah-platform-prd; do
  gcloud services enable run.googleapis.com sqladmin.googleapis.com \
    secretmanager.googleapis.com artifactregistry.googleapis.com \
    storage.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
    cloudresourcemanager.googleapis.com monitoring.googleapis.com \
    logging.googleapis.com --project $P
done

gcloud services enable storage.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com --project noah-platform-ops
```

Además, en la consola: **Facturación → Presupuestos y alertas** → un presupuesto mensual por proyecto con alertas al 50 %, 90 % y 100 %.

**Verificar:** `gcloud projects list` muestra los tres proyectos con facturación activa.

## Paso 9 · Primera especificación: 001-infra-base

En Antigravity, con el repositorio abierto:

1. `/speckit.specify` y peguen el bloque «Para /speckit.specify» de `specs-input/001-infra-base.md`.
   - **Verificar:** se creó una rama y `specs/001-.../spec.md`.
2. `/speckit.clarify` y respondan las preguntas. Si algo depende del administrador, usen el valor provisional de `docs/pending-decisions.md`.
3. Revisen `spec.md`: cada criterio de aceptación debe poder comprobarse con una prueba o una acción concreta.
4. `/speckit.plan` y peguen el bloque «Para /speckit.plan».
   - **Verificar:** el plan menciona RLS, `withTenant`, Cloud Run, Cloud SQL, Workload Identity Federation y pg-boss.
5. `/speckit.tasks`.
6. `/speckit.analyze`. Corrijan todo hallazgo crítico (especialmente violaciones a la constitución) antes de seguir.
7. `/speckit.implement`. Recomendación: implementen por bloques de tareas y revisen cada bloque antes de continuar.
8. Abran el pull request, revisen y fusionen.

**Durante la implementación de la 001** habrá un momento en que el agente necesite ejecutar Terraform de `infra/bootstrap`. Eso lo hace una persona con permisos de propietario en Google Cloud:

```bash
cd infra/bootstrap
terraform init
terraform apply
# Copiar las salidas (WIF provider, cuenta deployer, bucket de estado)
# a las variables de GitHub del Paso 6
```

**Criterio de cierre de la Fase 0:**
- [ ] `docker compose up -d && pnpm install && pnpm dev` levanta api y web en local.
- [ ] `/health` responde en local y en staging.
- [ ] La prueba de aislamiento entre tenants pasa en CI.
- [ ] Fusionar a `main` despliega a staging sin pasos manuales.
- [ ] Un tag `v0.1.0` despliega a producción tras aprobación.
- [ ] Sentry recibe un error de prueba; hay alertas de disponibilidad y presupuesto.

## Paso 10 · Siguientes especificaciones (Fase 1)

Repitan el ciclo del Paso 9 con los briefs, en el orden de `specs-input/README.md`:

1. `002-auth-usuarios`
2. `003-configurador` (al terminar, ejecuten `pnpm db:seed` para cargar NOAH)
3. `004-catastro`
4. `005-motor-reglas` (puede ir en paralelo desde que exista `packages/domain`)
5. `006-reservas-calendario`

Cuando 002 y 003 estén en implementación, pidan al agente redactar los briefs 007 a 011 siguiendo el mismo formato y la especificación de requerimientos.

## Paso 11 · Trabajos en paralelo (no bloquean el desarrollo)

| Trabajo | Responsable | Para cuándo |
| --- | --- | --- |
| Enviar los documentos de preguntas al administrador, al instalador y a la constructora | Gerencia | Esta semana |
| Volcar las respuestas en `docs/pending-decisions.md` y `seed/noah.config.json` | Líder técnico | Al recibirlas |
| Conseguir un lector y la guía ISAPI para la PoC | Gerencia + instalador | Antes de terminar la Fase 1 |
| Crear la app en Meta for Developers con el número de prueba | Líder técnico | Antes de la Fase 3 |
| Comprar la línea nueva para el número del bot | Gerencia | Antes del piloto |

## Reglas de trabajo diario

- Una rama por spec; pull requests pequeños por bloque de tareas.
- Si el agente propone algo que contradice la constitución, se corrige la propuesta, no la constitución. Cambiar la constitución requiere un ADR.
- Cuando cambie una regla o decisión, se actualiza `docs/` en el mismo pull request.
- Ningún valor de NOAH en el código: si aparece un `200`, `500` o el nombre de un área en el código, es un error de revisión.

## Problemas comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `specify init` no reconoce `agy` | Versión de Spec Kit antigua | Actualizar al último tag o usar `specify integration install agy` |
| Antigravity no aplica las reglas del proyecto | No cargó `AGENTS.md` | Agregar la regla de workspace del Paso 7 |
| Las consultas devuelven vacío en local | Falta fijar el tenant (`withTenant`) | Revisar el skill `prisma-multitenant` |
| `permission denied` en tablas con el usuario `noah_app` | Tablas creadas por otro usuario | Ejecutar migraciones con `DATABASE_MIGRATION_URL` (usuario `noah_owner`) |
| El volumen local no tiene el usuario `noah_app` | `init.sql` solo corre al crear el volumen | `docker compose down -v && docker compose up -d` |
| CI falla en `pnpm install --frozen-lockfile` | Falta `pnpm-lock.yaml` | Versionar el lockfile tras la primera instalación |
