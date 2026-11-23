-- Spec 002: Staff users, multi-tenant access, 2FA TOTP, sessions, tokens and auth audit
CREATE TYPE "StaffRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD');
CREATE TYPE "StaffTokenType" AS ENUM ('INVITE', 'PASSWORD_RESET');

CREATE TABLE "staff_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "StaffRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "totp_secret_enc" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

CREATE TABLE "staff_user_tenants" (
    "staff_user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_user_tenants_pkey" PRIMARY KEY ("staff_user_id", "tenant_id"),
    CONSTRAINT "staff_user_tenants_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staff_user_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "staff_user_tenants_tenant_id_idx" ON "staff_user_tenants"("tenant_id");

CREATE TABLE "staff_sessions" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "staff_sessions_refresh_token_hash_key" ON "staff_sessions"("refresh_token_hash");
CREATE INDEX "staff_sessions_staff_user_id_idx" ON "staff_sessions"("staff_user_id");

CREATE TABLE "staff_tokens" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "type" "StaffTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_tokens_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "staff_tokens_token_hash_key" ON "staff_tokens"("token_hash");
CREATE INDEX "staff_tokens_staff_user_id_idx" ON "staff_tokens"("staff_user_id");

CREATE TABLE "staff_recovery_codes" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_recovery_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_recovery_codes_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "staff_recovery_codes_staff_user_id_idx" ON "staff_recovery_codes"("staff_user_id");

CREATE TABLE "staff_auth_audits" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_auth_audits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_auth_audits_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "staff_auth_audits_staff_user_id_created_at_idx" ON "staff_auth_audits"("staff_user_id", "created_at");
