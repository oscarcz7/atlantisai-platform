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
  SUPERADMIN: 'SuperAdmin SaaS',
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

function getNavForRole(role: StaffProfile['role']): NavItem[] {
  if (role === 'SUPERADMIN') {
    return [
      { href: '/dashboard', label: 'Resumen SaaS', shortLabel: 'Resumen', icon: LayoutDashboard, roles: ['SUPERADMIN'] },
      { href: '/dashboard/buildings', label: 'Edificios', shortLabel: 'Edificios', icon: Building2, roles: ['SUPERADMIN'] },
      { href: '/dashboard/users', label: 'Administradores', shortLabel: 'Admins', icon: UserCog, roles: ['SUPERADMIN'] },
    ];
  }

  const allOperational: NavItem[] = [
    { href: '/dashboard', label: 'Resumen', shortLabel: 'Resumen', icon: LayoutDashboard, roles: ['ADMIN', 'ACCOUNTANT'] },
    { href: '/dashboard/garita', label: 'Garita', shortLabel: 'Garita', icon: Shield, roles: ['ADMIN', 'GUARD'] },
    { href: '/dashboard/reservations', label: 'Reservas', shortLabel: 'Reservas', icon: CalendarDays, roles: ['ADMIN', 'GUARD'] },
    { href: '/dashboard/cadastre', label: 'Catastro', shortLabel: 'Catastro', icon: Users, roles: ['ADMIN', 'ACCOUNTANT'] },
    { href: '/dashboard/billing', label: 'Finanzas', shortLabel: 'Finanzas', icon: Receipt, roles: ['ADMIN', 'ACCOUNTANT'] },
    { href: '/dashboard/incidents', label: 'Incidencias', shortLabel: 'Tickets', icon: Wrench, roles: ['ADMIN', 'GUARD'] },
    { href: '/dashboard/config', label: 'Configurador', shortLabel: 'Config', icon: SlidersHorizontal, roles: ['ADMIN'] },
    { href: '/dashboard/buildings', label: 'Mi Edificio', shortLabel: 'Edificio', icon: Building2, roles: ['ADMIN'] },
    { href: '/dashboard/users', label: 'Equipo', shortLabel: 'Equipo', icon: UserCog, roles: ['ADMIN'] },
    { href: '/dashboard/audit', label: 'Informes', shortLabel: 'Informes', icon: Activity, roles: ['ADMIN', 'ACCOUNTANT'] },
  ];

  return allOperational.filter((item) => item.roles.includes(role));
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, tenantId, setTenantId, logout } = useDashboard();

  const visibleItems = getNavForRole(me.role);
  const isSuperAdmin = me.role === 'SUPERADMIN';
  const activeTenantName = me.tenants.find((t) => t.id === tenantId)?.name ?? 'Plataforma NOAH';

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <Link
          className="brand-mark"
          href={me.role === 'GUARD' ? '/dashboard/garita' : '/dashboard'}
          aria-label="Inicio de NOAH"
          title="NOAH"
        >
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
          {me.role === 'ADMIN' && (
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
          <Link href={me.role === 'GUARD' ? '/dashboard/garita' : '/dashboard'} className="brand">
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
            {!isSuperAdmin && me.tenants.length > 0 && (
              <label className="tenant-pill" title="Edificio activo (todos los cambios aplican solo a este edificio)">
                <Building2 size={14} style={{ color: 'var(--primary)' }} />
                {me.tenants.length === 1 ? (
                  <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{me.tenants[0]!.name}</span>
                ) : (
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
                )}
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

        {/* Keying by tenantId guarantees a clean remount on building switch: zero stale forms or cross-building leakage */}
        <main key={isSuperAdmin ? 'saas' : tenantId} className="dashboard-content">
          {children}
        </main>

        <footer className="dashboard-footer">
          <span>© 2026 NOAH · {isSuperAdmin ? 'Consola SaaS' : activeTenantName}</span>
          <span>
            <Clock3 size={12} /> {isSuperAdmin ? 'Gestión multi-edificio' : 'Aislamiento activo por edificio'}
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
