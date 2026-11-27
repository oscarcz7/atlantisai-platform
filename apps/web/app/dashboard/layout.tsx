'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { SearchableSelect } from '../../components/habitat-ui';
import {
  Activity,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  Receipt,
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
  group: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

function getNavForRole(role: StaffProfile['role']): NavItem[] {
  if (role === 'SUPERADMIN') {
    return [
      { href: '/dashboard', label: 'Resumen SaaS', shortLabel: 'Resumen', icon: LayoutDashboard, roles: ['SUPERADMIN'], group: 'Plataforma' },
      { href: '/dashboard/buildings', label: 'Edificios', shortLabel: 'Edificios', icon: Building2, roles: ['SUPERADMIN'], group: 'Plataforma' },
      { href: '/dashboard/users', label: 'Administradores', shortLabel: 'Admins', icon: UserCog, roles: ['SUPERADMIN'], group: 'Plataforma' },
    ];
  }

  const allOperational: NavItem[] = [
    { href: '/dashboard', label: 'Resumen', shortLabel: 'Resumen', icon: LayoutDashboard, roles: ['ADMIN', 'ACCOUNTANT'], group: 'Operación' },
    { href: '/dashboard/garita', label: 'Garita', shortLabel: 'Garita', icon: Shield, roles: ['ADMIN', 'GUARD'], group: 'Operación' },
    { href: '/dashboard/reservations', label: 'Reservas', shortLabel: 'Reservas', icon: CalendarDays, roles: ['ADMIN', 'GUARD'], group: 'Operación' },
    { href: '/dashboard/access', label: 'Accesos QR', shortLabel: 'QR', icon: QrCode, roles: ['ADMIN', 'GUARD'], group: 'Operación' },
    { href: '/dashboard/incidents', label: 'Incidencias', shortLabel: 'Tickets', icon: Wrench, roles: ['ADMIN', 'GUARD'], group: 'Operación' },
    { href: '/dashboard/cadastre', label: 'Catastro', shortLabel: 'Catastro', icon: Users, roles: ['ADMIN', 'ACCOUNTANT'], group: 'Administración' },
    { href: '/dashboard/billing', label: 'Finanzas', shortLabel: 'Finanzas', icon: Receipt, roles: ['ADMIN', 'ACCOUNTANT'], group: 'Administración' },
    { href: '/dashboard/audit', label: 'Informes', shortLabel: 'Informes', icon: Activity, roles: ['ADMIN', 'ACCOUNTANT'], group: 'Administración' },
    { href: '/dashboard/config', label: 'Configurador', shortLabel: 'Config', icon: SlidersHorizontal, roles: ['ADMIN'], group: 'Edificio' },
    { href: '/dashboard/buildings', label: 'Mi Edificio', shortLabel: 'Edificio', icon: Building2, roles: ['ADMIN'], group: 'Edificio' },
    { href: '/dashboard/users', label: 'Equipo', shortLabel: 'Equipo', icon: UserCog, roles: ['ADMIN'], group: 'Edificio' },
  ];

  return allOperational.filter((item) => item.roles.includes(role));
}

function groupNavItems(items: NavItem[]): NavGroup[] {
  const map = new Map<string, NavItem[]>();
  for (const item of items) {
    const bucket = map.get(item.group) ?? [];
    bucket.push(item);
    map.set(item.group, bucket);
  }
  return Array.from(map.entries()).map(([title, groupItems]) => ({
    title,
    items: groupItems,
  }));
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, tenantId, setTenantId, logout } = useDashboard();
  const [collapsed, setCollapsed] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);

  const visibleItems = getNavForRole(me.role);
  const navGroups = groupNavItems(visibleItems);
  const currentItem = visibleItems.find((item) => item.href === pathname);
  const isSuperAdmin = me.role === 'SUPERADMIN';
  const homeHref = me.role === 'GUARD' ? '/dashboard/garita' : '/dashboard';
  const activeTenantName = me.tenants.find((t) => t.id === tenantId)?.name ?? 'Plataforma NOAH';

  const isFloatingOpen = collapsed && hoverExpanded;
  const showLabels = !collapsed || hoverExpanded;

  return (
    <div className={`dashboard-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-slot">
        <aside
          className={`sidebar ${isFloatingOpen ? 'sidebar-hover-open' : ''}`}
          aria-label="Navegación principal"
          onMouseEnter={() => {
            if (collapsed) setHoverExpanded(true);
          }}
          onMouseLeave={() => {
            if (hoverExpanded) setHoverExpanded(false);
          }}
        >
          <div className="sidebar-header">
            <Link
              className="sidebar-brand"
              href={homeHref}
              aria-label="Inicio de NOAH"
              title="NOAH"
            >
              <span className="brand-mark">
                <Building2 size={19} strokeWidth={2.3} />
              </span>
              {showLabels && (
                <span className="sidebar-brand-name">
                  noah<span className="brand-period">.</span>
                </span>
              )}
            </Link>

            {showLabels && (
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => {
                  if (collapsed) {
                    setCollapsed(false);
                    setHoverExpanded(false);
                  } else {
                    setCollapsed(true);
                    setHoverExpanded(false);
                  }
                }}
                title={collapsed ? 'Fijar menú expandido' : 'Colapsar menú lateral'}
                aria-label={collapsed ? 'Fijar menú expandido' : 'Colapsar menú lateral'}
              >
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            )}
          </div>

          <nav className="side-nav" aria-label="Secciones">
            {navGroups.map((group, groupIdx) => (
              <div key={group.title} className="side-group">
                {showLabels ? (
                  <div className="side-group-label">{group.title}</div>
                ) : (
                  groupIdx > 0 && <div className="side-group-divider" aria-hidden="true" />
                )}
                <div className="side-group-items">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={!showLabels ? item.label : undefined}
                        aria-label={item.label}
                        aria-current={active ? 'page' : undefined}
                        className={`side-link ${active ? 'selected' : ''}`}
                      >
                        <Icon size={17} strokeWidth={1.9} />
                        {showLabels && <span className="side-link-label">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="sidebar-bottom">
            {!showLabels && (
              <button
                type="button"
                className="side-link side-link-muted"
                onClick={() => {
                  setCollapsed(false);
                  setHoverExpanded(false);
                }}
                title="Expandir menú lateral"
                aria-label="Expandir menú lateral"
              >
                <PanelLeftOpen size={17} />
              </button>
            )}
            <button
              type="button"
              className="side-link side-link-muted"
              onClick={() => void logout()}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={17} />
              {showLabels && <span className="side-link-label">Cerrar sesión</span>}
            </button>
          </div>
        </aside>
      </div>

      <div className="dashboard-main">
        <header className="topbar">
          <div className="topbar-left">
            <Link href={homeHref} className="brand mobile-brand">
              <span className="brand-symbol">
                <Building2 size={18} />
              </span>
              <span>
                noah<span className="brand-period">.</span>
              </span>
            </Link>

            {currentItem && (
              <div className="topbar-breadcrumb" aria-label="Ubicación actual">
                <span>{currentItem.group}</span>
                <ChevronRight size={13} />
                <strong>{currentItem.label}</strong>
              </div>
            )}
          </div>

          <div className="topbar-right">
            {!isSuperAdmin && me.tenants.length > 0 && (
              <label className="tenant-pill" title="Edificio activo (todos los cambios aplican solo a este edificio)">
                <Building2 size={14} style={{ color: 'var(--primary)' }} />
                {me.tenants.length === 1 ? (
                  <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{me.tenants[0]!.name}</span>
                ) : (
                  <SearchableSelect
                    variant="bare"
                    ariaLabel="Edificio activo"
                    value={tenantId}
                    onChange={setTenantId}
                    searchPlaceholder="Buscar edificio..."
                    options={me.tenants.map((t) => ({
                      value: t.id,
                      label: t.name,
                      keywords: t.code,
                    }))}
                  />
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
