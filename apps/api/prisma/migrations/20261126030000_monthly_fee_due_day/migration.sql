-- Configurable due day for generated monthly fees (replaces the value hardcoded in the dashboard).
ALTER TABLE "tenant_settings"
  ADD COLUMN "monthly_fee_due_day" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_monthly_fee_due_day_check"
  CHECK ("monthly_fee_due_day" BETWEEN 1 AND 31);

-- Guard console warning margin before the free parking window ends.
ALTER TABLE "parking_configs"
  ADD COLUMN "alert_margin_minutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "parking_configs"
  ADD CONSTRAINT "parking_configs_alert_margin_minutes_check"
  CHECK ("alert_margin_minutes" >= 0);

-- Explicit flag: the unit's monthly fee was entered manually (not derived from m² × rate).
ALTER TABLE "units"
  ADD COLUMN "monthly_fee_is_manual" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any existing non-zero fee that does not match the automatic formula is manual.
-- Runs per tenant with app.tenant_id set so it also works when RLS is forced for the migration role.
DO $$
DECLARE
  t_id uuid;
BEGIN
  FOR t_id IN SELECT "id" FROM "tenants" LOOP
    PERFORM set_config('app.tenant_id', t_id::text, true);
    UPDATE "units" u
    SET "monthly_fee_is_manual" = true
    WHERE u."tenant_id" = t_id
      AND u."monthly_fee_cents" > 0
      AND NOT EXISTS (
        SELECT 1
        FROM "tenant_settings" s
        WHERE s."tenant_id" = t_id
          AND u."area_sqm" IS NOT NULL
          AND u."area_sqm" > 0
          AND s."monthly_fee_per_sqm_cents" > 0
          AND u."monthly_fee_cents" = ROUND((u."area_sqm" * s."monthly_fee_per_sqm_cents")::numeric)
      );
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$$;
