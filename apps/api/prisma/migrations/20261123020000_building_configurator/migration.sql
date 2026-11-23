-- Spec 003: Building configurator tables with forced PostgreSQL RLS
CREATE TYPE "AmenityMode" AS ENUM ('SHARED', 'EXCLUSIVE', 'FREE_USE');
CREATE TYPE "AdvancePolicy" AS ENUM ('GENERAL', 'SHORT_NOTICE_ALLOWED');
CREATE TYPE "OccupancyRole" AS ENUM ('OWNER_RESIDENT', 'OWNER_LANDLORD', 'LONG_TERM_TENANT', 'AIRBNB_HOST', 'AIRBNB_GUEST');

ALTER TABLE "tenants"
  ADD COLUMN "ruc" TEXT,
  ADD COLUMN "logo_url" TEXT,
  ADD COLUMN "contacts" JSONB,
  ADD COLUMN "office_hours" JSONB,
  ADD COLUMN "bank_accounts" JSONB;

CREATE TABLE "tenant_settings" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "deposit_required_cents" INTEGER NOT NULL,
  "arrears_tolerance_months" INTEGER NOT NULL,
  "payment_proof_deadline_minutes" INTEGER NOT NULL,
  "extra_guest_declared_cents" INTEGER NOT NULL,
  "extra_guest_undeclared_cents" INTEGER NOT NULL,
  "entry_margin_minutes" INTEGER NOT NULL,
  "general_advance_hours" INTEGER NOT NULL,
  "short_notice_advance_minutes" INTEGER NOT NULL,
  "frequency_week_start" TEXT NOT NULL DEFAULT 'MONDAY',
  "cancellation_policy" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tenant_settings_tenant_id_key" ON "tenant_settings"("tenant_id");
CREATE INDEX "tenant_settings_tenant_id_idx" ON "tenant_settings"("tenant_id");

CREATE TABLE "unit_types" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "included_guests" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "unit_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unit_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "unit_types_tenant_id_code_key" ON "unit_types"("tenant_id", "code");
CREATE INDEX "unit_types_tenant_id_idx" ON "unit_types"("tenant_id");

CREATE TABLE "amenities" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "max_duration_minutes" INTEGER NOT NULL,
  "schedule" JSONB,
  "frequency" JSONB,
  "mode" "AmenityMode" NOT NULL,
  "advance_policy" "AdvancePolicy" NOT NULL,
  "applies_guest_quota" BOOLEAN NOT NULL DEFAULT false,
  "requires_deposit" BOOLEAN NOT NULL DEFAULT false,
  "cleaning_fee_cents" INTEGER NOT NULL DEFAULT 0,
  "has_reader" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "amenities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "amenities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "amenities_tenant_id_code_key" ON "amenities"("tenant_id", "code");
CREATE INDEX "amenities_tenant_id_idx" ON "amenities"("tenant_id");

CREATE TABLE "amenity_access_rules" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "amenity_id" UUID NOT NULL,
  "occupancy_role" "OccupancyRole" NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "amenity_access_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "amenity_access_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "amenity_access_rules_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "amenity_access_rules_tenant_id_amenity_id_occupancy_role_key" ON "amenity_access_rules"("tenant_id", "amenity_id", "occupancy_role");
CREATE INDEX "amenity_access_rules_tenant_id_idx" ON "amenity_access_rules"("tenant_id");

CREATE TABLE "cleaning_combos" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "combo_key" TEXT NOT NULL,
  "amenity_ids" UUID[] NOT NULL,
  "fee_cents" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cleaning_combos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cleaning_combos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cleaning_combos_tenant_id_combo_key_key" ON "cleaning_combos"("tenant_id", "combo_key");
CREATE INDEX "cleaning_combos_tenant_id_idx" ON "cleaning_combos"("tenant_id");

CREATE TABLE "parking_configs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "spots" INTEGER NOT NULL,
  "free_minutes" INTEGER NOT NULL,
  "overtime_fee_cents_per_hour" INTEGER NOT NULL,
  "rounding" TEXT NOT NULL DEFAULT 'CEIL_HOUR',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "parking_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parking_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "parking_configs_tenant_id_key" ON "parking_configs"("tenant_id");
CREATE INDEX "parking_configs_tenant_id_idx" ON "parking_configs"("tenant_id");

-- Forced Row-Level Security on ALL tenant-scoped tables (Constitution Principle I)
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_settings"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "unit_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unit_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "unit_types"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "amenities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "amenities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "amenities"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "amenity_access_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "amenity_access_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "amenity_access_rules"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "cleaning_combos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_combos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cleaning_combos"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "parking_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parking_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "parking_configs"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
