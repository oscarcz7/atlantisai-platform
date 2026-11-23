# Spec 004 · Catastro: unidades, personas y ocupaciones

- **Rama:** `feat/004-catastro`
- **Fase:** 1 (Dashboard y motor de reglas)
- **Estado:** Aprobada para implementación
- **Origen:** [`specs-input/004-catastro.md`](../../specs-input/004-catastro.md)

## Objetivo

Registrar unidades, personas (con cédula cifrada y teléfono normalizado E.164) y ocupaciones con vigencias, de modo que los permisos de uso de áreas se activen y desactiven automáticamente por fecha y el propietario pase a `OWNER_LANDLORD` durante un arriendo fijo.

## Criterios de aceptación

- [ ] Al vencer `validTo` de una ocupación, sus permisos dejan de aplicar automáticamente sin intervención manual (`resolveEffectiveRole`).
- [ ] Mientras exista un `LONG_TERM_TENANT` vigente en una unidad, el propietario aparece efectivamente como `OWNER_LANDLORD` y no puede usar áreas.
- [ ] Un teléfono de WhatsApp (`wa_phone` E.164) no puede asignarse a dos personas en el mismo edificio (`@@unique([tenantId, waPhone])`).
- [ ] La cédula se almacena cifrada (`national_id_enc`), con hash para búsqueda (`national_id_hash`) y se muestra enmascarada por defecto (`17****8901`).
- [ ] Importación masiva (vista previa con validación fila por fila + confirmación transaccional).
- [ ] No se puede eliminar una unidad o persona con historial; solo desactivar (`is_active = false`).
- [ ] Toda alta, cambio o desactivación queda en `AuditLog` y las 3 tablas (`units`, `persons`, `occupancies`) llevan RLS forzado.
