# 004 · Catastro: unidades, personas y ocupaciones

## Para /speckit.specify

La administración necesita registrar quién vive o usa cada unidad y con qué rol, porque de eso dependen los permisos de uso de áreas, los cobros y la identificación en WhatsApp más adelante.

Roles de ocupación: propietario residente, propietario arrendador, arrendatario fijo, propietario anfitrión Airbnb, huésped Airbnb.

Historias:
1. Como Administrador, quiero registrar unidades con número, piso, tipología y alícuota mensual.
2. Como Administrador, quiero registrar personas con nombre, cédula, teléfono de WhatsApp, correo y su consentimiento de datos.
3. Como Administrador, quiero vincular personas a unidades con un rol y fechas de inicio y fin.
4. Como Administrador, cuando registro un arrendatario fijo, quiero que el propietario pase automáticamente a arrendador por ese periodo.
5. Como Administrador, quiero registrar estancias de huéspedes Airbnb con check-in y check-out.
6. Como Administrador, quiero importar unidades, personas y ocupaciones desde Excel, viendo los errores antes de guardar.
7. Como Administrador, quiero una ficha por unidad con ocupantes actuales e historial.

Criterios de aceptación:
- Al vencer la fecha de fin de una ocupación, sus permisos dejan de aplicar sin intervención manual.
- Mientras exista un arrendatario fijo vigente, el propietario aparece como arrendador y no puede usar áreas.
- Un teléfono de WhatsApp no puede estar asignado a dos personas en el mismo edificio.
- La cédula se guarda cifrada y en pantalla se muestra parcialmente, salvo para quien tenga permiso explícito.
- La importación muestra fila por fila qué está mal y no guarda nada si el usuario no confirma.
- No se puede eliminar una unidad o persona con historial financiero o de reservas; solo desactivar.
- Toda alta, cambio o baja queda en auditoría.

Fuera de alcance: saldos y movimientos (spec 007), garantías (spec 007).

## Para /speckit.plan

Respetar la constitución, `docs/domain-model.md` (Catastro), `docs/business-rules.md` (Ocupaciones y permisos) y los skills `nestjs-module`, `prisma-multitenant` y `dashboard-ui`.

- Módulo `cadastre`. Cifrado de cédula a nivel de campo con clave en Secret Manager (`FIELD_ENCRYPTION_KEY`) y un hash para búsquedas exactas.
- Teléfonos normalizados a E.164 con `libphonenumber-js` (país por defecto EC).
- Función de dominio `resolveEffectiveRole(person, unit, at)` en `packages/domain`, con pruebas, reutilizable por el motor de reglas.
- Importación de Excel con SheetJS: plantilla descargable, validación, vista previa, confirmación transaccional.
- Pantallas: unidades, personas, ficha de unidad, importación.
