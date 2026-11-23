import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service.js';

interface RlsCoverageRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: bigint;
}

/**
 * Constitution Principle I:
 * Fails if ANY table in schema `public` that has a `tenant_id` column
 * lacks ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY, or at least one policy.
 */
describe('Multi-tenant RLS schema coverage', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('verifies every table with tenant_id has forced RLS and an active policy', async () => {
    // Global SaaS tables that map staff users to tenants before a tenant session exists
    const globalSaasTables = new Set(['staff_user_tenants']);

    const rows = await prisma.$queryRaw<RlsCoverageRow[]>`
      SELECT
        c.table_name,
        cls.relrowsecurity AS rls_enabled,
        cls.relforcerowsecurity AS rls_forced,
        (
          SELECT COUNT(*)
          FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.table_name
        ) AS policy_count
      FROM information_schema.columns c
      JOIN pg_class cls ON cls.relname = c.table_name
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace AND ns.nspname = 'public'
      WHERE c.table_schema = 'public'
        AND c.column_name = 'tenant_id'
      ORDER BY c.table_name;
    `;

    const tenantScopedRows = rows.filter((r) => !globalSaasTables.has(r.table_name));
    expect(tenantScopedRows.length).toBeGreaterThan(0);

    for (const row of tenantScopedRows) {
      expect(row.rls_enabled, `Table ${row.table_name} must have RLS enabled`).toBe(true);
      expect(row.rls_forced, `Table ${row.table_name} must have FORCE RLS`).toBe(true);
      expect(
        Number(row.policy_count),
        `Table ${row.table_name} must have at least one RLS policy`,
      ).toBeGreaterThan(0);
    }
  });
});
