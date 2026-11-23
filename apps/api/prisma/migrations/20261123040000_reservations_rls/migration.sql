-- Spec 006: Reservations, combo amenities, attendees with forced PostgreSQL RLS
CREATE TYPE "ReservationStatus" AS ENUM (
  'PENDING_PAYMENT',
  'IN_REVIEW',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
  'ADMIN_BLOCK'
);

CREATE TABLE "reservations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "unit_id" UUID,
  "person_id" UUID,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "declared_attendees" INTEGER NOT NULL DEFAULT 1,
  "status" "ReservationStatus" NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'DASHBOARD',
  "total_cents" INTEGER NOT NULL DEFAULT 0,
  "charges" JSONB,
  "hold_expires_at" TIMESTAMPTZ,
  "cancellation_reason" TEXT,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reservations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "reservations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reservations_tenant_id_idempotency_key_key" ON "reservations"("tenant_id", "idempotency_key");
CREATE INDEX "reservations_tenant_id_starts_at_ends_at_idx" ON "reservations"("tenant_id", "starts_at", "ends_at");
CREATE INDEX "reservations_tenant_id_status_hold_expires_at_idx" ON "reservations"("tenant_id", "status", "hold_expires_at");

CREATE TABLE "reservation_amenities" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "amenity_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reservation_amenities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_amenities_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reservation_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reservation_amenities_reservation_id_amenity_id_key" ON "reservation_amenities"("reservation_id", "amenity_id");
CREATE INDEX "reservation_amenities_tenant_id_amenity_id_idx" ON "reservation_amenities"("tenant_id", "amenity_id");

CREATE TABLE "reservation_attendees" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "name" TEXT,
  "wa_phone" TEXT,
  "is_extra" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reservation_attendees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_attendees_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "reservation_attendees_tenant_id_reservation_id_idx" ON "reservation_attendees"("tenant_id", "reservation_id");

-- Forced RLS
ALTER TABLE "reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "reservations"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "reservation_amenities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_amenities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "reservation_amenities"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "reservation_attendees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_attendees" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "reservation_attendees"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
