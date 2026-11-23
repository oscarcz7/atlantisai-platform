# Plataforma de Gestión Residencial — Edificio NOAH

Plataforma SaaS multi-edificio: dashboard administrativo, acceso por QR con lectores Hikvision y bot de WhatsApp con agentes de IA. Piloto: Edificio NOAH (Grupo Baluarte).

**Para empezar, sigan [`GETTING_STARTED.md`](GETTING_STARTED.md).**

## Cómo está organizado

| Ruta | Contenido |
| --- | --- |
| `AGENTS.md` | Contexto del proyecto para agentes de IA (Antigravity, Claude Code). |
| `.specify/memory/constitution.md` | Principios no negociables (Spec Kit). |
| `specs-input/` | Briefs para crear cada especificación con Spec Kit, en orden. |
| `specs/` | Especificaciones, planes y tareas generados por Spec Kit. |
| `docs/` | Arquitectura, infraestructura, dominio, reglas de negocio, decisiones pendientes, diseño, convenciones, integraciones y ADR. |
| `.agents/skills/` | Skills del proyecto y de Spec Kit. |
| `seed/noah.config.json` | Configuración inicial del Edificio NOAH según el Manual. |
| `ai/` | Prompts, herramientas y evals de los agentes del bot (Fase 3). |
| `infra/` | Terraform para Google Cloud y base de datos local. |
| `apps/`, `packages/` | Código (se crea a partir de la spec 001). |

## Stack

NestJS · Next.js · PostgreSQL 16 + pgvector · Prisma · pg-boss · pnpm + Turborepo · Google Cloud (Cloud Run, Cloud SQL, Cloud Storage, Secret Manager) · Terraform · GitHub Actions.

## Fases

0 Base técnica → 1 Dashboard y motor de reglas → 2 QR y lectores → 3 WhatsApp e IA → 4 Piloto NOAH.
