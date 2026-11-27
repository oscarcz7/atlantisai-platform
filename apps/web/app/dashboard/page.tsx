'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Home,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';
import { Money, StatusBadge } from '@noah/ui';
import { ModuleHero, SearchableSelect } from '../../components/habitat-ui';
import { authApi, type StaffProfile } from '../../lib/api/auth';
import { useDashboard } from '../../lib/dashboard-context';

interface TenantSummary {
  id: string;
  code: string;
  name: string;
  ruc: string | null;
  timezone: string;
}

interface UnitRow {
  id: string;
  number: string;
  floor: number;
  monthlyFeeCents: number;
  occupancies: Array<{ id: string }>;
}

interface PersonRow {
  id: string;
}

interface ReservationRow {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  unit?: { number: string } | null;
  amenities?: Array<{ amenity: { name: string } }>;
}

interface IncidentRow {
  id: string;
  category: string;
  location: string;
  description: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
}

interface SummaryReport {
  reservationsByStatus?: Array<{ status: string; count: number }>;
  ledgerByType?: Array<{ type: string; count: number; totalCents: number }>;
}

const URGENCY_LABELS: Record<IncidentRow['urgency'], { label: string; cls: string }> = {
  EMERGENCY: { label: 'Emergencia', cls: 'priority-alta' },
  HIGH: { label: 'Alta', cls: 'priority-alta' },
  MEDIUM: { label: 'Media', cls: 'priority-media' },
  LOW: { label: 'Baja', cls: 'priority-baja' },
};

const WORK_COLORS = ['work-coral', 'work-gold', 'work-sage'];

function SuperAdminOverview() {
  const { token, apiFetch } = useDashboard();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [users, setUsers] = useState<StaffProfile[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<TenantSummary[]>('/tenants').catch(() => []),
      authApi.listStaffUsers(token).catch(() => []),
    ]).then(([t, u]) => {
      setTenants(t);
      setUsers(u);
    });
  }, [apiFetch, token]);

  const admins = users.filter((u) => u.role === 'ADMIN');
  const activeAdmins = admins.filter((u) => u.isActive !== false);

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="CONSOLA SAAS · SUPERADMIN"
        title="Panel de plataforma NOAH"
        description="Crea edificios con su configuración base y asigna administradores responsables. Cada administrador gestiona la operación y el equipo de sus edificios."
        icon={Building2}
        actions={
          <>
            <Link href="/dashboard/users" className="h-btn-outline">
              <UserCog size={14} /> Gestionar administradores
            </Link>
            <Link href="/dashboard/buildings" className="h-btn-dark">
              <Plus size={15} /> Nuevo edificio
            </Link>
          </>
        }
      />

      <div className="h-kpi-strip">
        <article className="h-kpi-card" style={{ background: 'linear-gradient(145deg,#fa865c,#ee5835)', color: '#fff', borderColor: 'transparent' }}>
          <span style={{ color: '#ffffffd8' }}>Edificios activos</span>
          <strong>{String(tenants.length).padStart(2, '0')}</strong>
          <small style={{ color: '#ffffffd0' }}>con aislamiento RLS en BD</small>
        </article>
        <article className="h-kpi-card">
          <span>Administradores</span>
          <strong>{String(activeAdmins.length).padStart(2, '0')}</strong>
          <small>de {admins.length} registrados</small>
        </article>
        <article className="h-kpi-card">
          <span>Personal total en plataforma</span>
          <strong>{String(users.length).padStart(2, '0')}</strong>
          <small>SuperAdmin, Admins, Contadores y Guardias</small>
        </article>
      </div>

      <div className="h-table-wrap">
        <div style={{ padding: '16px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Edificios y administradores asignados</h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted-foreground)' }}>
              Cada edificio opera de forma independiente con su administrador asignado.
            </p>
          </div>
          <Link href="/dashboard/buildings" className="text-action" style={{ padding: '6px 12px', fontSize: '12px' }}>
            Administrar edificios <ArrowUpRight size={13} />
          </Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Edificio</th>
              <th>Código / RUC</th>
              <th>Administradores asignados</th>
              <th style={{ textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const assignedAdmins = admins.filter((a) => a.tenants.some((at) => at.id === t.id));
              return (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ fontSize: '12.5px', color: 'var(--muted-foreground)' }}>
                    <code>{t.code}</code> {t.ruc ? `· ${t.ruc}` : ''}
                  </td>
                  <td>
                    {assignedAdmins.length === 0 ? (
                      <span style={{ color: 'var(--color-warning)', fontSize: '12.5px' }}>Sin administrador asignado</span>
                    ) : (
                      assignedAdmins.map((a) => a.fullName).join(', ')
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link href="/dashboard/users" className="h-btn-outline h-btn-sm" style={{ textDecoration: 'none' }}>
                      Asignar admin
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DashboardOverviewPage() {
  const { me, tenantId, apiFetch } = useDashboard();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const activeTenant = me.tenants.find((t) => t.id === tenantId);

  const load = useCallback(async () => {
    if (!tenantId || me.role === 'SUPERADMIN') return;
    const [u, p, r, inc, rep] = await Promise.all([
      apiFetch<UnitRow[]>('/cadastre/units').catch(() => []),
      apiFetch<PersonRow[]>('/cadastre/persons').catch(() => []),
      apiFetch<ReservationRow[]>('/reservations').catch(() => []),
      me.role !== 'ACCOUNTANT'
        ? apiFetch<IncidentRow[]>('/incidents').catch(() => [])
        : Promise.resolve([]),
      me.role !== 'GUARD'
        ? apiFetch<SummaryReport>('/audit/reports/summary').catch(() => null)
        : Promise.resolve(null),
    ]);
    setUnits(u);
    setPersons(p);
    setReservations(r);
    setIncidents(inc);
    setSummary(rep);
  }, [apiFetch, tenantId, me.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const upcomingReservations = useMemo(() => {
    return reservations
      .filter((r) => r.status === 'CONFIRMED' || r.status === 'IN_REVIEW')
      .slice(0, 4);
  }, [reservations]);

  const visibleIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const matchQuery = `${inc.category} ${inc.location} ${inc.description}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || inc.status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [incidents, query, statusFilter]);

  if (me.role === 'SUPERADMIN') {
    return <SuperAdminOverview />;
  }

  const occupiedUnits = units.filter((u) => u.occupancies.length > 0).length;
  const occupancyPct = units.length > 0 ? Math.round((occupiedUnits / units.length) * 100) : 0;
  const floorsCount = units.length > 0 ? new Set(units.map((u) => u.floor)).size : 0;
  const monthlyBillingTotalCents = units.reduce((sum, u) => sum + u.monthlyFeeCents, 0);

  const openIncidents = incidents.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
  const highPriorityIncidents = openIncidents.filter(
    (i) => i.urgency === 'HIGH' || i.urgency === 'EMERGENCY',
  );
  const confirmedReservations = reservations.filter((r) => r.status === 'CONFIRMED');
  const pendingReviewReservations = reservations.filter(
    (r) => r.status === 'PENDING_PAYMENT' || r.status === 'IN_REVIEW',
  );

  const collectedCents = Math.abs(
    summary?.ledgerByType?.find((l) => l.type === 'PAYMENT')?.totalCents ?? 0,
  );
  const billedCents =
    summary?.ledgerByType?.find((l) => l.type === 'MONTHLY_FEE')?.totalCents ?? 0;

  const todayLabel = new Intl.DateTimeFormat('es-EC', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const firstName = me.fullName.split(' ')[0] ?? me.fullName;

  const chartBars = [38, 46, 41, 52, 48, 56, 49, 60];
  const chartLabels = ['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  return (
    <section>
      <div className="welcome-row">
        <div>
          <span className="date-kicker">{todayLabel}</span>
          <h1>Hola, {firstName}</h1>
          <p>
            Resumen operativo de <strong>{activeTenant?.name ?? 'tu edificio'}</strong> en tiempo real.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {me.role === 'ADMIN' && (
            <Link href="/dashboard/config" className="download-button">
              Configurar edificio <ArrowUpRight size={15} />
            </Link>
          )}
          {me.role !== 'ACCOUNTANT' && (
            <Link href="/dashboard/reservations" className="download-button">
              Ir a reservas <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel balance-card">
          <div>
            <div className="panel-eyebrow">
              <span>EDIFICIO ACTIVO</span>
              <span className="building-score">
                <ShieldCheck size={13} /> Operativo
              </span>
            </div>
            <div className="building-name-row">
              <div>
                <h2>{activeTenant?.name ?? 'Edificio'}</h2>
                <p>
                  <span className="online-dot" />
                  Código: {activeTenant?.code ?? '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="occupancy-block">
            <div className="occupancy-value">
              {occupiedUnits} <span>/ {units.length} unidades ocupadas</span>
            </div>
            <div className="occupancy-track">
              <span style={{ width: `${Math.max(occupancyPct, units.length > 0 ? 6 : 0)}%` }} />
            </div>
            <div className="occupancy-foot">
              <span>{occupancyPct}% de ocupación</span>
              <Link href="/dashboard/cadastre">
                Ver catastro <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>

          <div className="building-footer">
            <div>
              <span className="mini-icon">
                <Home size={15} />
              </span>
              <span>
                <b>{units.length}</b>
                <small>Unidades</small>
              </span>
            </div>
            <div>
              <span className="mini-icon">
                <Users size={15} />
              </span>
              <span>
                <b>{persons.length}</b>
                <small>Personas</small>
              </span>
            </div>
            <div>
              <span className="mini-icon">
                <Building2 size={15} />
              </span>
              <span>
                <b>{floorsCount}</b>
                <small>Pisos</small>
              </span>
            </div>
          </div>
        </section>

        <section className="metric-grid" aria-label="Indicadores clave">
          <article className="panel metric-card metric-featured">
            <div className="metric-top">
              <span>Alícuotas base / mes</span>
              <span className="metric-icon">
                <Receipt size={15} />
              </span>
            </div>
            <strong>
              <Money cents={monthlyBillingTotalCents} />
            </strong>
            <div className="change-line">
              <span className="change positive">{units.length} unid.</span>
              <span>facturación estimada</span>
            </div>
          </article>

          <article className="panel metric-card">
            <div className="metric-top">
              <span>Incidencias abiertas</span>
              <span className="metric-icon">
                <Wrench size={15} />
              </span>
            </div>
            <strong>{String(openIncidents.length).padStart(2, '0')}</strong>
            <div className="change-line">
              <span className={`change ${highPriorityIncidents.length > 0 ? 'negative' : 'positive'}`}>
                {highPriorityIncidents.length} alta
              </span>
              <span>de {incidents.length} totales</span>
            </div>
          </article>

          <article className="panel metric-card">
            <div className="metric-top">
              <span>Reservas activas</span>
              <span className="metric-icon">
                <CalendarDays size={15} />
              </span>
            </div>
            <strong>{String(confirmedReservations.length).padStart(2, '0')}</strong>
            <div className="change-line">
              <span className="change positive">{pendingReviewReservations.length} pend.</span>
              <span>por confirmar / pago</span>
            </div>
          </article>

          <article className="panel metric-card">
            <div className="metric-top">
              <span>Recaudado</span>
              <span className="metric-icon">
                <ShieldCheck size={15} />
              </span>
            </div>
            <strong>
              <Money cents={collectedCents} />
            </strong>
            <div className="change-line">
              <span className="change positive">
                <Money cents={billedCents} />
              </span>
              <span>emitido en ledger</span>
            </div>
          </article>
        </section>

        <section className="panel income-panel" aria-labelledby="collection-title">
          <div className="section-heading">
            <div>
              <h2 id="collection-title">Balance del edificio</h2>
              <p>Alícuotas frente a cargos y recaudación</p>
            </div>
            <Link href="/dashboard/billing" className="text-action" style={{ padding: '6px 10px', fontSize: '11px' }}>
              Finanzas <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-profit" />
              Recaudado
            </span>
            <span>
              <i className="legend-loss" />
              Pendiente
            </span>
          </div>
          <div className="chart-area" role="img" aria-label="Tendencia mensual del edificio">
            <div className="y-labels">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>
            <div className="bar-chart">
              {chartBars.map((height, index) => (
                <div className="bar-column" key={chartLabels[index]}>
                  <div className="bar-stack" style={{ height: `${height * 1.9}px` }}>
                    <span className="bar-profit" style={{ height: `${Math.round(height * 1.1)}%` }} />
                    <span className="bar-loss" />
                  </div>
                  <small>{chartLabels[index]}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="left-stack">
          <section className="panel cards-panel">
            <div className="section-heading">
              <div className="cards-title">
                <CalendarDays size={17} />
                <h2>Próximas reservas</h2>
              </div>
              {me.role === 'ADMIN' && (
                <Link href="/dashboard/reservations" className="add-card" style={{ padding: '6px 10px', fontSize: '11px' }}>
                  + Nueva
                </Link>
              )}
            </div>

            <div className="work-list">
              {upcomingReservations.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '10px 0' }}>
                  No hay reservas activas todavía.
                </p>
              ) : (
                upcomingReservations.map((res, idx) => {
                  const dt = new Date(res.startsAt);
                  const day = String(dt.getDate()).padStart(2, '0');
                  const month = new Intl.DateTimeFormat('es-EC', { month: 'short' })
                    .format(dt)
                    .replace('.', '')
                    .toUpperCase();
                  const time = new Intl.DateTimeFormat('es-EC', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(dt);
                  const areaNames =
                    res.amenities?.map((a) => a.amenity.name).join(' + ') || 'Área comunal';
                  return (
                    <Link key={res.id} href="/dashboard/reservations" className="work-item">
                      <span className={`work-date ${WORK_COLORS[idx % WORK_COLORS.length]}`}>
                        <b>{day}</b>
                        <small>{month}</small>
                      </span>
                      <span className="work-copy">
                        <b>{areaNames}</b>
                        <small>
                          Depto. {res.unit?.number ?? '—'} · {time}
                        </small>
                      </span>
                      <ArrowUpRight size={15} style={{ color: 'var(--muted-foreground)' }} />
                    </Link>
                  );
                })
              )}
            </div>

            <Link href="/dashboard/reservations" className="work-calendar-link">
              Ver agenda completa <ArrowUpRight size={13} />
            </Link>
          </section>
        </div>

        <section className="panel activity-panel" aria-labelledby="requests-title">
          <div className="activity-header">
            <div className="requests-heading">
              <h2 id="requests-title">Incidencias recientes</h2>
              <p>Seguimiento de novedades y PQRS del edificio</p>
            </div>
            <div className="activity-tools">
              <label className="search-box">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar ticket..."
                />
              </label>
              <label className="filter-box">
                <SlidersHorizontal size={14} />
                <SearchableSelect
                  variant="bare"
                  ariaLabel="Filtrar incidencias por estado"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  searchPlaceholder="Filtrar estado..."
                  options={[
                    { value: 'ALL', label: 'Todas' },
                    { value: 'OPEN', label: 'Abiertas' },
                    { value: 'IN_PROGRESS', label: 'En curso' },
                    { value: 'RESOLVED', label: 'Resueltas' },
                  ]}
                />
              </label>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 12px' }}>Solicitud</th>
                  <th style={{ padding: '10px 12px' }}>Ubicación</th>
                  <th style={{ padding: '10px 12px' }}>Urgencia</th>
                  <th style={{ padding: '10px 12px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibleIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                      No hay incidencias registradas con este filtro.
                    </td>
                  </tr>
                ) : (
                  visibleIncidents.slice(0, 6).map((inc) => {
                    const urg = URGENCY_LABELS[inc.urgency] ?? URGENCY_LABELS.MEDIUM;
                    return (
                      <tr key={inc.id} style={{ borderBottom: '1px solid #f0eee9' }}>
                        <td style={{ padding: '11px 12px' }}>
                          <div style={{ fontWeight: 600 }}>{inc.description}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{inc.category}</div>
                        </td>
                        <td style={{ padding: '11px 12px' }}>{inc.location || 'Área común'}</td>
                        <td style={{ padding: '11px 12px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor:
                                urg.cls === 'priority-alta'
                                  ? '#fae9e6'
                                  : urg.cls === 'priority-media'
                                    ? '#f8f0dc'
                                    : '#e9f2ec',
                              color:
                                urg.cls === 'priority-alta'
                                  ? '#b7544d'
                                  : urg.cls === 'priority-media'
                                    ? '#99771f'
                                    : '#52816c',
                            }}
                          >
                            {urg.label}
                          </span>
                        </td>
                        <td style={{ padding: '11px 12px' }}>
                          <StatusBadge status={inc.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
