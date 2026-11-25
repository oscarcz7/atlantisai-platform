# Spec 003 · Configurador del edificio

- **Rama:** `feat/003-configurador`
- **Fase:** 1 (Dashboard y motor de reglas)
- **Estado:** Implementada y refinada (v1.1)
- **Origen:** [`specs-input/003-configurador.md`](../../specs-input/003-configurador.md)

## Objetivo

Permitir que SuperAdmin y Administrador configuren por completo los edificios, parámetros financieros/operativos, tipologías, áreas comunales, matriz de acceso, combos de limpieza y parqueaderos de visitas de cada edificio sin programar, clonar configuraciones entre edificios y cargar `seed/noah.config.json` de forma idempotente.

## Criterios de aceptación

- [x] Ningún valor de NOAH existe hardcodeado en el código ni en los placeholders de la UI; todo se lee desde la configuración del tenant.
- [x] Validaciones estrictas: no se puede guardar un área con `capacity <= 0`, `maxDurationMinutes <= 0`, horario con cierre ≤ apertura o frecuencia con `max <= 0`.
- [x] Un combo de limpieza solo puede incluir áreas con `cleaningFeeCents > 0`, y no puede repetirse el mismo conjunto de áreas.
- [x] Toda tabla de configuración lleva `tenant_id` y política RLS forzada (verificado por `rls-coverage.int.spec.ts`).
- [x] Todo cambio de configuración queda registrado en `AuditLog` con valores antes y después.
- [x] Clonar un edificio copia parámetros, tipologías, áreas, matriz de acceso, combos y parqueaderos con un nuevo `tenant_id`, sin copiar datos operativos.
- [x] `pnpm db:seed` carga `seed/noah.config.json` de forma idempotente (ejecutarlo dos veces no duplica registros).
- [x] Contador y Guardia no pueden modificar configuración (HTTP 403).

## Refinamientos SDD (v1.1)

- **CRUD completo de Edificios (`/dashboard/buildings`):**
  - `SUPERADMIN`: crear, editar, clonar y eliminar edificios (`DELETE /tenants/:id`, bloqueado con HTTP 409 si tiene reservas o movimientos contables).
  - `ADMIN`: solo edita datos de contacto, horarios y cuentas bancarias de sus propios edificios (`PATCH /tenants/:id` valida pertenencia).
  - **Vinculación directa de administradores (`adminUserIds`):** al crear o editar un edificio como `SUPERADMIN`, se pueden asignar usuarios `ADMIN` del sistema y autocompletar el contacto público para residentes (soportando tanto empresa administradora + encargado como administrador persona natural).
  - **Múltiples cuentas bancarias (`bankAccounts[]`):** cada edificio admite 1 o más cuentas con `bank`, `accountType`, `accountNumber`, `holder`, `rucOrId` y `purpose` (*General*, *Alícuotas*, *Garantías*, *Áreas comunales*).
- **Parámetro de alícuota por m² y dormitorios por tipología:**
  - `TenantSettings.monthlyFeePerSqmCents` (ej. USD 3,00/m²) editable desde **Configurador → Parámetros y Alícuota**.
  - `UnitType.bedrooms` configurable por tipología, junto con borrado seguro (`DELETE /catalog/unit-types/:id` y `DELETE /catalog/amenities/:id`, rechazando con HTTP 409 si están en uso).
- **CRUD interactivo en las 6 pestañas del Configurador:** Parámetros y Alícuota, Áreas comunales (incluye horario y frecuencia), Matriz de acceso, Tipologías, Combos de limpieza y Parqueaderos.
