'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { type StaffProfile } from '../../lib/api/auth';
import { DashboardProvider, useDashboard } from '../../lib/dashboard-context';

const ROLE_LABELS: Record<StaffProfile['role'], string> = {
  SUPERADMIN: 'SuperAdmin',
  ADMIN: 'Administrador',
  ACCOUNTANT: 'Contador',
  GUARD: 'Guardia',
};

interface NavItem {
  href: string;
  label: string;
  roles: StaffProfile['role'][];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard/reservations', label: 'Reservas', roles: ['SUPERADMIN', 'ADMIN', 'GUARD'] },
  { href: '/dashboard/cadastre', label: 'Catastro', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/dashboard/billing', label: 'Finanzas y Bandeja', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { href: '/dashboard/garita', label: 'Consola de Garita', roles: ['SUPERADMIN', 'ADMIN', 'GUARD'] },
  { href: '/dashboard/incidents', label: 'Incidencias', roles: ['SUPERADMIN', 'ADMIN', 'GUARD'] },
  { href: '/dashboard/config', label: 'Configurador', roles: ['SUPERADMIN', 'ADMIN'] },
  { href: '/dashboard/users', label: 'Usuarios internos', roles: ['SUPERADMIN'] },
  { href: '/dashboard/audit', label: 'Auditoría y Reportes', roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'] },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, tenantId, setTenantId, logout } = useDashboard();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(me.role));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}>
      <aside
        style={{
          width: '236px',
          flexShrink: 0,
          backgroundColor: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 14px',
        }}
      >
        <div style={{ padding: '0 8px 18px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>Plataforma NOAH</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Gestión Residencial
          </div>
        </div>

        <nav style={{ display: 'grid', gap: '4px', marginTop: '16px' }}>
          {visibleItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: active ? 600 : 500,
                  backgroundColor: active ? 'var(--color-primary)' : 'transparent',
                  color: active ? '#ffffff' : 'var(--color-text)',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            marginTop: 'auto',
            paddingTop: '16px',
            borderTop: '1px solid var(--color-border)',
            fontSize: '12px',
            color: 'var(--color-text-muted)',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{me.fullName}</div>
          <div>{ROLE_LABELS[me.role]}</div>
          <button
            type="button"
            onClick={logout}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '7px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'transparent',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: '56px',
            padding: '0 24px',
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          {me.tenants.length > 0 && (
            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Edificio activo:</span>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontWeight: 500,
                }}
              >
                {me.tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>

        <div style={{ flex: 1, padding: '24px', maxWidth: '1200px', width: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <Shell>{children}</Shell>
    </DashboardProvider>
  );
}
