'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  Activity,
  Building2,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  Shield,
  SlidersHorizontal,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
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
  shortLabel: string;
  icon: LucideIcon;
  roles: StaffProfile['role'][];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Resumen',
    shortLabel: 'Resumen',
    icon: LayoutDashboard,
    roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD'],
  },
  {
    href: '/dashboard/buildings',
    label: 'Edificios',
    shortLabel: 'Edificios',
    icon: Building2,
    roles: ['SUPERADMIN', 'ADMIN'],
  },
  {
    href: '/dashboard/config',
    label: 'Configurador',
    shortLabel: 'Config',
    icon: SlidersHorizontal,
    roles: ['SUPERADMIN', 'ADMIN'],
  },
  {
    href: '/dashboard/cadastre',
    label: 'Catastro',
    shortLabel: 'Catastro',
    icon: Users,
    roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'],
  },
  {
    href: '/dashboard/reservations',
    label: 'Reservas',
    shortLabel: 'Reservas',
    icon: CalendarDays,
    roles: ['SUPERADMIN', 'ADMIN', 'GUARD'],
  },
  {
    href: '/dashboard/billing',
    label: 'Finanzas',
    shortLabel: 'Finanzas',
    icon: Receipt,
    roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'],
  },
  {
    href: '/dashboard/garita',
    label: 'Garita',
    shortLabel: 'Garita',
    icon: Shield,
    roles: ['SUPERADMIN', 'ADMIN', 'GUARD'],
  },
  {
    href: '/dashboard/incidents',
    label: 'Incidencias',
    shortLabel: 'Tickets',
    icon: Wrench,
    roles: ['SUPERADMIN', 'ADMIN', 'GUARD'],
  },
  {
    href: '/dashboard/audit',
    label: 'Informes',
    shortLabel: 'Informes',
    icon: Activity,
    roles: ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT'],
  },
  {
    href: '/dashboard/users',
    label: 'Usuarios',
    shortLabel: 'Staff',
    icon: UserCog,
    roles: ['SUPERADMIN'],
  },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, tenantId, setTenantId, logout } = useDashboard();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(me.role));
  const activeTenantName = me.tenants.find((t) => t.id === tenantId)?.name ?? 'NOAH';

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <Link className="brand-mark" href="/dashboard" aria-label="Inicio de NOAH" title="NOAH">
          <Building2 size={20} strokeWidth={2.3} />
        </Link>

        <nav className="side-nav" aria-label="Secciones">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`side-link ${active ? 'selected' : ''}`}
              >
                <Icon size={18} strokeWidth={1.85} />
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          {(me.role === 'SUPERADMIN' || me.role === 'ADMIN') && (
            <Link href="/dashboard/config" className="icon-button" title="Configurador" aria-label="Configurador">
              <Settings size={18} />
            </Link>
          )}
          <button
            type="button"
            className="icon-button"
            onClick={() => void logout()}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="topbar">
          <Link href="/dashboard" className="brand">
            <span className="brand-symbol">
              <Building2 size={19} />
            </span>
            <span>
              noah<span className="brand-period">.</span>
            </span>
          </Link>

          <nav className="top-nav" aria-label="Accesos directos">
            {visibleItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'top-nav-active' : ''}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="topbar-right">
            {me.tenants.length > 0 && (
              <label className="tenant-pill" title="Edificio activo">
                <Building2 size={14} style={{ color: 'var(--primary)' }} />
                <select
                  aria-label="Edificio activo"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                >
                  {me.tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              className="profile"
              type="button"
              onClick={() => void logout()}
              title="Haz clic para cerrar sesión"
            >
              <span className="avatar">{getInitials(me.fullName)}</span>
              <span className="profile-copy">
                <b>{me.fullName}</b>
                <small>{ROLE_LABELS[me.role]}</small>
              </span>
              <LogOut size={14} style={{ color: 'var(--muted-foreground)' }} />
            </button>
          </div>
        </header>

        <nav className="mobile-nav" aria-label="Navegación móvil">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={active ? 'mobile-nav-active' : ''}
              >
                <Icon size={16} />
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>

        <main className="dashboard-content">{children}</main>

        <footer className="dashboard-footer">
          <span>© 2026 NOAH · {activeTenantName}</span>
          <span>
            <Clock3 size={12} /> Plataforma multi-edificio en tiempo real
          </span>
        </footer>
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
