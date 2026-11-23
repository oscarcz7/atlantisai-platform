# Spec 003 · Configurador del edificio

- **Rama:** `feat/003-configurador`
- **Fase:** 1 (Dashboard y motor de reglas)
- **Estado:** Aprobada para implementación
- **Origen:** [`specs-input/003-configurador.md`](../../specs-input/003-configurador.md)

## Objetivo

Permitir que SuperAdmin y Administrador configuren por completo los parámetros, tipologías, áreas comunales, matriz de acceso, combos de limpieza y parqueaderos de visitas de cada edificio sin programar, clonar configuraciones entre edificios y cargar `seed/noah.config.json` de forma idempotente.

## Criterios de aceptación

- [ ] Ningún valor de NOAH existe hardcodeado en el código; todo se lee desde la configuración del tenant.
- [ ] Validaciones estrictas: no se puede guardar un área con `capacity <= 0`, `maxDurationMinutes <= 0`, horario con cierre ≤ apertura o frecuencia con `max <= 0`.
- [ ] Un combo de limpieza solo puede incluir áreas con `cleaningFeeCents > 0`, y no puede repetirse el mismo conjunto de áreas.
- [ ] Toda tabla de configuración lleva `tenant_id` y política RLS forzada (verificado por `rls-coverage.int.spec.ts`).
- [ ] Todo cambio de configuración queda registrado en `AuditLog` con valores antes y después.
- [ ] Clonar un edificio copia parámetros, tipologías, áreas, matriz de acceso, combos y parqueaderos con un nuevo `tenant_id`, sin copiar datos operativos.
- [ ] `pnpm db:seed` carga `seed/noah.config.json` de forma idempotente (ejecutarlo dos veces no duplica registros).
- [ ] Contador y Guardia no pueden modificar configuración (HTTP 403).
