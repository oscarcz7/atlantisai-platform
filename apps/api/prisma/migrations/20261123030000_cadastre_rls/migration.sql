-- Spec 004: Cadastre (units, persons, occupancies) with forced PostgreSQL RLS
CREATE TABLE "units" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "floor" INTEGER NOT NULL,
  "unit_type_id" UUID NOT NULL,
  "monthly_fee_cents" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "units_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "units_unit_type_id_fkey" FOREIGN KEY ("unit_type_id") REFERENCES "unit_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "units_tenant_id_number_key" ON "units"("tenant_id", "number");
CREATE INDEX "units_tenant_id_idx" ON "units"("tenant_id");

CREATE TABLE "persons" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "full_name" TEXT NOT NULL,
  "national_id_enc" TEXT NOT NULL,
  "national_id_hash" TEXT NOT NULL,
  "national_id_mask" TEXT NOT NULL,
  "wa_phone" TEXT NOT NULL,
  "email" TEXT,
  "consent_at" TIMESTAMPTZ,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "persons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "persons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "persons_tenant_id_wa_phone_key" ON "persons"("tenant_id", "wa_phone");
CREATE INDEX "persons_tenant_id_idx" ON "persons"("tenant_id");
CREATE INDEX "persons_tenant_id_national_id_hash_idx" ON "persons"("tenant_id", "national_id_hash");

CREATE TABLE "occupancies" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "role" "OccupancyRole" NOT NULL,
  "valid_from" TIMESTAMPTZ NOT NULL,
  "valid_to" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "occupancies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "occupancies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "occupancies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "occupancies_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "occupancies_tenant_id_idx" ON "occupancies"("tenant_id");
CREATE INDEX "occupancies_tenant_id_unit_id_idx" ON "occupancies"("tenant_id", "unit_id");
CREATE INDEX "occupancies_tenant_id_person_id_idx" ON "occupancies"("tenant_id", "person_id");

-- Forced RLS
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "units"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "persons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "persons" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "persons"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "occupancies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "occupancies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "occupancies"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
