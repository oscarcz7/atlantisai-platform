-- Phase 2 PoC: Access Control (Readers, QR Credentials, Gateway Commands, Access Events) with forced PostgreSQL RLS

CREATE TYPE "ReaderStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

CREATE TYPE "CredentialSyncStatus" AS ENUM (
  'PENDING',
  'LOADED',
  'REVOKE_PENDING',
  'REVOKED',
  'ERROR'
);

CREATE TYPE "GatewayCommandType" AS ENUM (
  'UPSERT_CREDENTIAL',
  'REVOKE_CREDENTIAL',
  'PURGE',
  'PING',
  'OPEN_DOOR'
);

CREATE TYPE "GatewayCommandStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACKED', 'FAILED');

CREATE TYPE "AccessEventResult" AS ENUM ('GRANTED', 'DENIED');

CREATE TABLE "readers" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "serial" TEXT,
  "model" TEXT NOT NULL DEFAULT 'DS-K1T344EBFWX-E1',
  "protocol" TEXT NOT NULL DEFAULT 'http',
  "ip" TEXT NOT NULL,
  "port" INTEGER NOT NULL DEFAULT 80,
  "door_no" INTEGER NOT NULL DEFAULT 1,
  "firmware" TEXT,
  "amenity_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "status" "ReaderStatus" NOT NULL DEFAULT 'UNKNOWN',
  "last_seen_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "readers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "readers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "readers_tenant_id_code_key" ON "readers"("tenant_id", "code");
CREATE INDEX "readers_tenant_id_idx" ON "readers"("tenant_id");

CREATE TABLE "credentials" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "reservation_id" UUID,
  "employee_no" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "reader_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "valid_from" TIMESTAMPTZ NOT NULL,
  "valid_to" TIMESTAMPTZ NOT NULL,
  "max_opens" INTEGER,
  "sync_status" "CredentialSyncStatus" NOT NULL DEFAULT 'PENDING',
  "last_error" TEXT,
  "synced_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "credentials_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "credentials_tenant_id_employee_no_key" ON "credentials"("tenant_id", "employee_no");
CREATE UNIQUE INDEX "credentials_tenant_id_code_key" ON "credentials"("tenant_id", "code");
CREATE INDEX "credentials_tenant_id_reservation_id_idx" ON "credentials"("tenant_id", "reservation_id");
CREATE INDEX "credentials_tenant_id_sync_status_idx" ON "credentials"("tenant_id", "sync_status");

CREATE TABLE "gateway_commands" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "reader_id" UUID,
  "credential_id" UUID,
  "idempotency_key" TEXT NOT NULL,
  "type" "GatewayCommandType" NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "GatewayCommandStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "acked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "gateway_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gateway_commands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gateway_commands_reader_id_fkey" FOREIGN KEY ("reader_id") REFERENCES "readers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "gateway_commands_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gateway_commands_tenant_id_idempotency_key_key" ON "gateway_commands"("tenant_id", "idempotency_key");
CREATE INDEX "gateway_commands_tenant_id_status_created_at_idx" ON "gateway_commands"("tenant_id", "status", "created_at");

CREATE TABLE "access_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "reader_id" UUID,
  "credential_id" UUID,
  "employee_no" TEXT,
  "credential_code" TEXT,
  "result" "AccessEventResult" NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "raw_payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "access_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "access_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "access_events_reader_id_fkey" FOREIGN KEY ("reader_id") REFERENCES "readers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "access_events_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "access_events_tenant_id_occurred_at_idx" ON "access_events"("tenant_id", "occurred_at");
CREATE INDEX "access_events_tenant_id_reader_id_idx" ON "access_events"("tenant_id", "reader_id");

-- Forced RLS
ALTER TABLE "readers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "readers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "readers"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "credentials"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "gateway_commands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gateway_commands" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "gateway_commands"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "access_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "access_events"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
