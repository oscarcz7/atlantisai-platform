-- Specs 007-011: Billing, Deposits, Payment Proofs, Receipts, Visits, Incidents with forced RLS
CREATE TYPE "LedgerEntryType" AS ENUM ('MONTHLY_FEE', 'CLEANING', 'EXTRA_GUEST', 'PARKING_OVERTIME', 'DAMAGE', 'PAYMENT', 'ADJUSTMENT');
CREATE TYPE "DepositMovementType" AS ENUM ('DEPOSIT', 'DEDUCTION', 'REFUND');
CREATE TYPE "PaymentProofStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "TicketUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TABLE "ledger_entries" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "type" "LedgerEntryType" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "due_date" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ledger_entries_tenant_id_unit_id_idx" ON "ledger_entries"("tenant_id", "unit_id");
CREATE INDEX "ledger_entries_tenant_id_unit_id_type_due_date_idx" ON "ledger_entries"("tenant_id", "unit_id", "type", "due_date");

CREATE TABLE "deposit_accounts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "balance_cents" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deposit_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "deposit_accounts_tenant_id_unit_id_key" ON "deposit_accounts"("tenant_id", "unit_id");
CREATE INDEX "deposit_accounts_tenant_id_idx" ON "deposit_accounts"("tenant_id");

CREATE TABLE "deposit_movements" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "deposit_account_id" UUID NOT NULL,
  "type" "DepositMovementType" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deposit_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deposit_movements_deposit_account_id_fkey" FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "deposit_movements_tenant_id_deposit_account_id_idx" ON "deposit_movements"("tenant_id", "deposit_account_id");

CREATE TABLE "payment_proofs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "reservation_id" UUID,
  "file_key" TEXT NOT NULL,
  "bank" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "transfer_date" TIMESTAMPTZ NOT NULL,
  "reference" TEXT NOT NULL,
  "extracted_by" TEXT NOT NULL DEFAULT 'HUMAN',
  "status" "PaymentProofStatus" NOT NULL DEFAULT 'PENDING',
  "reviewed_by" TEXT,
  "rejection_reason" TEXT,
  "reviewed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_proofs_tenant_id_status_idx" ON "payment_proofs"("tenant_id", "status");
CREATE INDEX "payment_proofs_tenant_id_reference_amount_cents_idx" ON "payment_proofs"("tenant_id", "reference", "amount_cents");

CREATE TABLE "collection_receipts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "sequence_number" INTEGER NOT NULL,
  "receipt_code" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "payment_proof_id" UUID,
  "ledger_entry_ids" UUID[] NOT NULL,
  "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_receipts_tenant_id_sequence_number_key" ON "collection_receipts"("tenant_id", "sequence_number");
CREATE INDEX "collection_receipts_tenant_id_unit_id_idx" ON "collection_receipts"("tenant_id", "unit_id");

CREATE TABLE "visits" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "host_unit_id" UUID NOT NULL,
  "visitor_name" TEXT NOT NULL,
  "national_id_enc" TEXT NOT NULL,
  "national_id_mask" TEXT NOT NULL,
  "plate" TEXT,
  "needs_parking" BOOLEAN NOT NULL DEFAULT false,
  "parking_spot" INTEGER,
  "expected_at" TIMESTAMPTZ NOT NULL,
  "check_in_at" TIMESTAMPTZ,
  "check_out_at" TIMESTAMPTZ,
  "overtime_cents" INTEGER NOT NULL DEFAULT 0,
  "registered_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "visits_tenant_id_expected_at_idx" ON "visits"("tenant_id", "expected_at");
CREATE INDEX "visits_tenant_id_parking_spot_check_out_at_idx" ON "visits"("tenant_id", "parking_spot", "check_out_at");

CREATE TABLE "tickets" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "urgency" "TicketUrgency" NOT NULL DEFAULT 'MEDIUM',
  "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reported_by" TEXT NOT NULL,
  "assigned_to" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tickets_tenant_id_status_idx" ON "tickets"("tenant_id", "status");
CREATE INDEX "tickets_tenant_id_location_category_created_at_idx" ON "tickets"("tenant_id", "location", "category", "created_at");

CREATE TABLE "ticket_subscribers" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_subscribers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_subscribers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ticket_subscribers_ticket_id_person_id_key" ON "ticket_subscribers"("ticket_id", "person_id");
CREATE INDEX "ticket_subscribers_tenant_id_ticket_id_idx" ON "ticket_subscribers"("tenant_id", "ticket_id");

-- Forced RLS on ALL 8 new tables (Constitution Principle I)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ledger_entries',
    'deposit_accounts',
    'deposit_movements',
    'payment_proofs',
    'collection_receipts',
    'visits',
    'tickets',
    'ticket_subscribers'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl
    );
  END LOOP;
END $$;
