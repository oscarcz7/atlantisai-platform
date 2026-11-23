---
name: prisma-multitenant
description: Cómo modelar tablas, escribir migraciones Prisma y consultar datos con aislamiento multi-tenant por Row-Level Security en PostgreSQL. Úsalo siempre que se cree o modifique un modelo de Prisma, una migración, una consulta, un seed o cualquier acceso a la base de datos, incluso para cambios de una sola columna.
---

# Prisma multi-tenant con RLS

## Modelo
Toda tabla de negocio:

```prisma
model Amenity {
  id        String   @id @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  // ...
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  @@index([tenantId])
  @@map("amenities")
}
```

- IDs UUID v7 generados en la aplicación.
- Dinero: `Int` en centavos con sufijo `Cents`.
- Fechas: `@db.Timestamptz`, siempre UTC.
- Rangos de reserva: `starts_at` y `ends_at`; para exclusividad, restricción de exclusión con `tstzrange` en la migración SQL.

## Migración con RLS
Prisma no genera políticas; añádelas al SQL de la migración:

```sql
ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON amenities
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

Toda tabla nueva con `tenant_id` lleva estas cuatro líneas. La prueba `rls-coverage.int.spec.ts` falla si una tabla con `tenant_id` no tiene política.

## Consultas
Siempre dentro de una transacción con el tenant fijado:

```ts
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    return fn(tx);
  });
}
```

- Aun con RLS, incluye `tenantId` en los `where` para que los índices funcionen.
- Nunca uses el rol con `BYPASSRLS` en código de la aplicación. Tareas globales usan `withSystemRole()`, que audita.
- Las tablas de pg-boss viven en el esquema `pgboss` y no llevan RLS; los jobs incluyen `tenantId` en su payload y el worker abre `withTenant` al procesarlos.
- Para cupos y disponibilidad, bloquea con `SELECT ... FOR UPDATE` sobre el área o usa un advisory lock por `(tenant, amenity, día)`.

## Seeds
- `pnpm db:seed --tenant noah` lee `seed/noah.config.json`.
- El seed es idempotente (upsert por claves naturales: código de tipología, nombre de área).

## Checklist
- [ ] `tenant_id` + índice + política RLS
- [ ] Montos en centavos, fechas timestamptz
- [ ] Prueba de aislamiento
- [ ] Migración revisada (sin borrados destructivos sin plan de datos)
