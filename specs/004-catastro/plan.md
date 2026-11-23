# Plan técnico · 004-catastro

- **`packages/domain`:** Función pura `resolveEffectiveRole(personId, occupancies, at)` + `maskNationalId` + `normalizeEcuadorPhone` (E.164 EC `+593...`) con pruebas unitarias.
- **Prisma + migración `20261123030000_cadastre_rls`:** Tablas `units`, `persons`, `occupancies`, todas con `tenant_id`, índices y `ENABLE`/`FORCE ROW LEVEL SECURITY` + política `tenant_isolation`.
- **Backend (`apps/api/src/modules/cadastre/`):**
  - CRUD de unidades, personas (cifrado AES-256-GCM vía `FieldEncryptionService`), ocupaciones (al registrar `LONG_TERM_TENANT` se refleja el rol efectivo `OWNER_LANDLORD` para el propietario y se registra en auditoría), ficha de unidad (`GET /cadastre/units/:id`) e importación masiva (`POST /cadastre/import/preview` + `POST /cadastre/import/confirm`).
- **Frontend (`apps/web/app/dashboard/cadastre/page.tsx`):** Pestañas Unidades, Personas y Ocupaciones con formularios de alta rápida.
