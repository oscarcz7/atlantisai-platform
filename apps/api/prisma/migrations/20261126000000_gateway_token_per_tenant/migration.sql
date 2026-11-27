-- Per-tenant Edge Gateway token (stored only as SHA-256 hash). The tenant is derived
-- from the token, never from a client-supplied header.
ALTER TABLE "tenants" ADD COLUMN "gateway_token_hash" TEXT;
ALTER TABLE "tenants" ADD COLUMN "gateway_token_rotated_at" TIMESTAMPTZ;
CREATE UNIQUE INDEX "tenants_gateway_token_hash_key" ON "tenants"("gateway_token_hash");
