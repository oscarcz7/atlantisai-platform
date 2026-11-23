# AGENTS.md — Plataforma de Gestión Residencial (piloto: Edificio NOAH)

Contexto obligatorio para cualquier agente de IA que trabaje en este repositorio (Antigravity, Claude Code u otros). Los principios no negociables están en `.specify/memory/constitution.md`; este archivo explica el proyecto y cómo trabajar en él.

## Qué es este proyecto

Plataforma SaaS multi-edificio para administrar edificios en régimen de propiedad horizontal (Ecuador). Tres canales:

1. **Dashboard web** para administración, contabilidad y guardianía.
2. **QR temporales** validados por los lectores Hikvision DS-K1T344EBFWX-E1 de las áreas comunales.
3. **Bot de WhatsApp** con agentes de IA para residentes.

El primer edificio (tenant) es NOAH. Un edificio nuevo se da de alta por configuración, nunca cambiando código.

## Cómo se trabaja: Spec-Driven Development

Toda funcionalidad pasa por el ciclo de Spec Kit antes de escribir código:

1. `/speckit.specify` con el brief de `specs-input/` → genera `specs/NNN-nombre/spec.md`.
2. `/speckit.clarify` → resolver ambigüedades; lo que dependa del administrador se registra en `docs/pending-decisions.md` con valor provisional.
3. `/speckit.plan` → plan técnico respetando este archivo, la constitución y `docs/`.
4. `/speckit.tasks` → tareas numeradas.
5. `/speckit.analyze` → revisar consistencia entre spec, plan, tareas y constitución.
6. `/speckit.implement` → implementar tarea por tarea, con pruebas.

No implementes nada que no esté en una especificación aprobada. Si encuentras un hueco, detente y propón el cambio a la spec.

## Fase actual

Fase 0 (base técnica) y Fase 1 (dashboard y motor de reglas). Orden de especificaciones: ver `specs-input/README.md`. No construyas funcionalidad de Fase 2 (QR y lectores) ni Fase 3 (WhatsApp e IA) sin que se pida explícitamente.

## Stack

- Monorepo: pnpm workspaces + Turborepo. Node.js 22 LTS.
- Backend (`apps/api`): NestJS, TypeScript estricto, Prisma, PostgreSQL 16 + pgvector, colas con pg-boss.
- Dashboard (`apps/web`): Next.js (App Router), TypeScript, Tailwind CSS, TanStack Query, React Hook Form + zod.
- Edge Gateway (`apps/gateway`, Fase 2): Node.js en mini PC Linux dentro del edificio.
- Nube: Google Cloud — Cloud Run (`api`, `web`), Cloud SQL, Cloud Storage, Secret Manager, Artifact Registry. Región `us-east1`.
- Infraestructura como código: Terraform en `infra/`.
- CI/CD: GitHub Actions con Workload Identity Federation (sin claves JSON de servicio).
- Observabilidad: Cloud Logging + Sentry.

## Estructura del monorepo

```
apps/
  api/          # NestJS: módulos por dominio
  web/          # Next.js: dashboard y consola de garita
  gateway/      # Edge Gateway (Fase 2)
packages/
  domain/       # Tipos, enums, códigos y mensajes de rechazo
  rules/        # Motor de reglas de reservas (puro, sin I/O)
  ui/           # Componentes y tokens del dashboard
  config/       # eslint, tsconfig, prettier compartidos
infra/          # Terraform (Google Cloud)
ai/             # Prompts, herramientas y evals de los agentes (Fase 3)
docs/           # Documentación técnica: fuente de contexto
seed/           # Configuración semilla por edificio
specs-input/    # Briefs para /speckit.specify
specs/          # Especificaciones generadas por Spec Kit
.specify/       # Plantillas, scripts y constitución de Spec Kit
.agents/skills/ # Skills del proyecto y de Spec Kit
```

## Comandos

```bash
pnpm install
docker compose up -d     # PostgreSQL + pgvector local
pnpm dev                 # api + web
pnpm test                # pruebas unitarias
pnpm test:int            # integración con PostgreSQL real
pnpm test:e2e            # flujos de extremo a extremo
pnpm lint && pnpm typecheck
pnpm db:migrate          # prisma migrate dev
pnpm db:seed             # carga seed/noah.config.json
```

Si un comando no existe todavía, créalo en el `package.json` raíz o del paquete, en lugar de inventar alternativas.

## Reglas obligatorias (resumen; detalle en la constitución)

1. Multi-tenant siempre: `tenant_id` + Row-Level Security en toda tabla de negocio; consultas con `withTenant`.
2. Todo lo que varía entre edificios es parámetro; ningún valor de NOAH escrito en el código.
3. El LLM interpreta, el código decide.
4. Dashboard y bot usan los mismos servicios; sin lógica de negocio en controladores ni en el frontend.
5. Dinero en centavos (enteros). Fechas en UTC, mostradas en `America/Guayaquil`.
6. Auditoría en toda acción sensible.
7. Datos personales cifrados o enmascarados; nunca en logs.
8. Pruebas de aceptación y rechazo para cada regla del motor.
9. Código y commits en inglés; textos de usuario y documentación en español.

## Dónde buscar contexto

| Necesitas | Lee |
| --- | --- |
| Principios no negociables | `.specify/memory/constitution.md` |
| Componentes y despliegue | `docs/architecture.md`, `docs/infrastructure.md` |
| Entidades y estados | `docs/domain-model.md` |
| Reglas de reservas, cobros y acceso | `docs/business-rules.md` |
| Valores aún no definidos | `docs/pending-decisions.md` |
| Pantallas | `docs/design-system.md` |
| Estilo de código, Git, pruebas, seguridad | `docs/conventions.md` |
| Lectores Hikvision | `docs/integrations/hikvision.md` |
| WhatsApp | `docs/integrations/whatsapp.md` |
| Por qué se decidió algo | `docs/adr/` |

## Skills del proyecto (`.agents/skills/`)

`nestjs-module`, `prisma-multitenant`, `reglas-reservas`, `dashboard-ui`, `infra-gcp`, `hikvision-gateway`, `whatsapp-canal`, `agentes-ia`. Úsalos cuando la tarea coincida con su descripción.
