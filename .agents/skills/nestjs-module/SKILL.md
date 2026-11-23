---
name: nestjs-module
description: Cómo crear o modificar un módulo de dominio del backend NestJS de la plataforma (controller, service, repository, DTOs, eventos y pruebas) respetando multi-tenant, auditoría e idempotencia. Úsalo siempre que se cree un endpoint, un CRUD, un servicio o un módulo nuevo en apps/api, aunque la tarea parezca pequeña.
---

# Módulo NestJS

## Antes de empezar
1. Lee `docs/architecture.md` → «Módulos del backend» para saber a qué módulo pertenece el cambio.
2. Lee `docs/domain-model.md` para la entidad involucrada.
3. Si el cambio toca reglas de reservas o cobros, usa también el skill `reglas-reservas`.

## Estructura

```
apps/api/src/modules/<modulo>/
  <modulo>.module.ts
  <modulo>.controller.ts      # HTTP: valida DTO, llama al service, mapea errores
  <modulo>.service.ts         # lógica; recibe TenantContext
  <modulo>.repository.ts      # Prisma, siempre dentro de withTenant()
  dto/                        # class-validator; uno por operación
  events/                     # eventos de dominio emitidos
  <modulo>.service.spec.ts
  <modulo>.int.spec.ts        # integración con PostgreSQL real
```

## Reglas
- Controller delgado: sin lógica de negocio ni acceso a Prisma.
- El service recibe `ctx: TenantContext` como primer argumento; nunca toma el tenant de otra fuente.
- Todo acceso a datos pasa por `withTenant(ctx, tx => …)` (ver skill `prisma-multitenant`).
- Guardas: `@Roles(...)` en cada endpoint; por defecto, denegar.
- Acciones sensibles llaman a `AuditService.record()` dentro de la misma transacción.
- Endpoints que crean cobros, reservas o credenciales aceptan la cabecera `Idempotency-Key`.
- Errores de dominio: `throw new DomainError(code, details)`; el filtro global los traduce a HTTP 409/422 con `{ code, message }`.
- Listados: paginación por cursor, filtros explícitos, orden estable.
- Nada de valores de negocio escritos en el código; léelos de la configuración del tenant.

## CRUD estándar
Para entidades de configuración o catastro: `GET /` (lista paginada), `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` (borrado lógico con `deletedAt` cuando la entidad tenga historia financiera o de accesos).

## Pruebas mínimas
- Unitarias del service con repositorio simulado: caso feliz, cada error de dominio.
- Integración: crear en un tenant y verificar que otro tenant no lo ve.
- Si emite eventos, verificar que se emiten con el payload correcto.

## Checklist de salida
- [ ] DTOs validados y documentados en OpenAPI
- [ ] Roles definidos en cada endpoint
- [ ] Auditoría en acciones sensibles
- [ ] Prueba de aislamiento entre tenants
- [ ] `docs/` actualizado si cambió el modelo o una regla
