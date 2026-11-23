# Briefs para Spec Kit

Cada archivo tiene dos bloques para copiar en Antigravity:

- **Para `/speckit.specify`**: el qué y el porqué (usuarios, historias, criterios de aceptación). Sin tecnología.
- **Para `/speckit.plan`**: la dirección técnica que el plan debe respetar.

## Orden

| # | Brief | Fase | Depende de |
| --- | --- | --- | --- |
| 001 | `001-infra-base.md` | 0 | — |
| 002 | `002-auth-usuarios.md` | 1 | 001 |
| 003 | `003-configurador.md` | 1 | 002 |
| 004 | `004-catastro.md` | 1 | 003 |
| 005 | `005-motor-reglas.md` | 1 | 003 (puede empezar en paralelo: es una librería pura) |
| 006 | `006-reservas-calendario.md` | 1 | 004, 005 |

Siguientes (se redactan cuando 001–003 estén en implementación): 007 estados de cuenta y garantías, 008 bandeja contable y comprobantes de recaudación, 009 consola de garita y visitas, 010 incidencias, 011 auditoría y reportes.

## Cómo usar cada brief

1. `/speckit.specify` + pegar el bloque «Para /speckit.specify».
2. `/speckit.clarify` y responder. Si la respuesta depende del administrador, usar el valor provisional de `docs/pending-decisions.md`.
3. Revisar `spec.md` generado: que cada criterio de aceptación sea verificable.
4. `/speckit.plan` + pegar el bloque «Para /speckit.plan».
5. `/speckit.tasks` y luego `/speckit.analyze`. Corregir hallazgos críticos antes de implementar.
6. `/speckit.implement`. Revisar cada pull request.
