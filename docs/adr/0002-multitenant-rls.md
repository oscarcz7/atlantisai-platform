# ADR-0002: Multi-tenant con Row-Level Security

- Estado: Aceptada
- Fecha: 2026-11-18

## Contexto
La plataforma servirá a varios edificios. Una base por edificio complica migraciones y operación; un filtro por `tenant_id` solo en el código es frágil ante un olvido.

## Decisión
Base de datos compartida. Cada tabla de negocio tiene `tenant_id` y una política RLS que compara con `current_setting('app.tenant_id')`. La API fija esa variable al inicio de cada transacción a partir del contexto autenticado. El rol de base de datos de la aplicación no tiene `BYPASSRLS`.

## Consecuencias
- Un olvido en el código no expone datos de otro edificio: la base lo impide.
- Toda consulta debe ejecutarse dentro de una transacción con el tenant fijado (helper `withTenant`).
- Las tareas globales (SuperAdmin, purgas) usan un rol separado y auditado.
