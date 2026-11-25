# Spec 004 · Catastro: unidades, personas y ocupaciones

- **Rama:** `feat/004-catastro`
- **Fase:** 1 (Dashboard y motor de reglas)
- **Estado:** Implementada y refinada (v1.1)
- **Origen:** [`specs-input/004-catastro.md`](../../specs-input/004-catastro.md)

## Objetivo

Registrar unidades (con metraje, dormitorios y cálculo automático de alícuota), personas (con cédula cifrada y teléfono normalizado E.164) y ocupaciones con vigencias, de modo que los permisos de uso de áreas se activen y desactiven automáticamente por fecha y el propietario pase a `OWNER_LANDLORD` durante un arriendo fijo.

## Criterios de aceptación

- [x] Al vencer `validTo` de una ocupación, sus permisos dejan de aplicar automáticamente sin intervención manual (`resolveEffectiveRole`).
- [x] Mientras exista un `LONG_TERM_TENANT` vigente en una unidad, el propietario aparece efectivamente como `OWNER_LANDLORD` y no puede usar áreas.
- [x] Un teléfono de WhatsApp (`wa_phone` E.164) no puede asignarse a dos personas en el mismo edificio (`@@unique([tenantId, waPhone])`).
- [x] La cédula se almacena cifrada (`national_id_enc`), con hash para búsqueda (`national_id_hash`) y se muestra enmascarada por defecto (`17****8901`).
- [x] Importación masiva (vista previa con validación fila por fila + confirmación transaccional).
- [x] No se puede eliminar físicamente una unidad o persona con historial; en ese caso se desactiva (`is_active = false`).
- [x] Toda alta, cambio, eliminación o desactivación queda en `AuditLog` y las 3 tablas (`units`, `persons`, `occupancies`) llevan RLS forzado.

## Refinamientos SDD (v1.1)

- **Metraje, dormitorios y alícuota automática por m²:**
  - `Unit.areaSqm` (`DOUBLE PRECISION`) y `Unit.bedrooms` (`INTEGER`) agregados en migración `20261123060000_unit_area_bedrooms_fee_per_sqm`.
  - Al crear o editar (`PATCH /cadastre/units/:id`) una unidad con metraje, la alícuota mensual (`monthlyFeeCents`) se calcula automáticamente como `Math.round(areaSqm * settings.monthlyFeePerSqmCents)`, con vista previa en vivo en UI y opción explícita de sobrescribir manualmente.
  - Al elegir tipología en el formulario, se sugieren automáticamente sus dormitorios.
- **Acciones de eliminación seguras en UI y API:**
  - `DELETE /cadastre/units/:id` y `DELETE /cadastre/persons/:id`: borran físicamente si no existe historial (reservas, ledger, visitas); de lo contrario desactivan (`isActive = false`).
  - `DELETE /cadastre/occupancies/:id`: permite desvincular una ocupación directamente desde el chip del ocupante en la tabla de unidades.
