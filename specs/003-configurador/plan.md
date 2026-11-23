# Plan técnico · 003-configurador

- **Prisma:** Extender `Tenant` (RUC, logo, contactos, horarios, cuentas bancarias) y agregar `TenantSettings`, `UnitType`, `Amenity`, `AmenityAccessRule`, `CleaningCombo` y `ParkingConfig`, todas con `tenant_id`, índice y RLS forzado en la migración `20261123020000_building_configurator`.
- **Backend:**
  - Módulo `tenants`: alta/edición de edificios, importación JSON idempotente (`importConfig`), clonación transaccional (`cloneTenant`).
  - Módulo `catalog`: CRUDs validados con `withTenant(ctx, ...)` y escritura en `AuditLog` dentro de la misma transacción.
  - Script `pnpm db:seed` (`apps/api/src/scripts/seed-noah.ts`) que lee `seed/noah.config.json`.
- **Frontend:** Pantalla `/dashboard/config` con pestañas (Datos generales, Parámetros, Tipologías, Áreas, Matriz de acceso con interruptores, Combos de limpieza y Parqueaderos).
