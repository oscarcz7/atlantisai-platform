'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Car, Clock, LogIn, LogOut, Plus, Shield } from 'lucide-react';
import { Money, StatusBadge } from '@noah/ui';
import { HabitatDrawer, HabitatToast, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { useDashboard } from '../../../lib/dashboard-context';
import { formatTimeInZone } from '../../../lib/zoned-time';

interface ParkingLive {
  minutesParked: number;
  freeMinutes: number;
  remainingFreeMinutes: number;
  overtimeMinutes: number;
  billedHoursSoFar: number;
  overtimeCentsSoFar: number;
  alertLevel: 'OK' | 'WARNING' | 'OVERTIME';
  alert: boolean;
}

interface ParkingSpot {
  spot: number;
  occupied: boolean;
  visitId: string | null;
  visitorName: string | null;
  plate: string | null;
  checkInAt: string | null;
  /** Computed by the API (ParkingConfig): live minutes, overtime so far and alert flag. */
  parking: ParkingLive | null;
}

interface ParkingStatus {
  configured: boolean;
  totalSpots: number;
  freeMinutes: number | null;
  overtimeFeeCentsPerHour: number | null;
  alertMarginMinutes: number | null;
  spots: ParkingSpot[];
}

interface VisitRow {
  id: string;
  visitorName: string;
  nationalId: string;
  plate: string | null;
  needsParking: boolean;
  parkingSpot: number | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  overtimeCents: number;
  parking: ParkingLive | null;
}

interface UnitOption {
  id: string;
  number: string;
}

const REFRESH_MS = 60_000;

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export default function GaritaConsolePage() {
  const { tenantId, tenantTimezone, apiFetch } = useDashboard();
  const [parkingStatus, setParkingStatus] = useState<ParkingStatus | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [hostUnitId, setHostUnitId] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [plate, setPlate] = useState('');
  const [needsParking, setNeedsParking] = useState(true);

  const loadLive = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [pk, vis] = await Promise.all([
        apiFetch<ParkingStatus>('/visits/parking-status'),
        apiFetch<VisitRow[]>('/visits'),
      ]);
      setParkingStatus(pk);
      setVisits(vis);
      setLastUpdated(new Date());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo actualizar la consola de garita.');
    }
  }, [apiFetch, tenantId]);

  const loadUnits = useCallback(async () => {
    if (!tenantId) return;
    try {
      const un = await apiFetch<UnitOption[]>('/cadastre/units');
      setUnits(un);
      setHostUnitId((prev) => prev || un[0]?.id || '');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar las unidades.');
    }
  }, [apiFetch, tenantId]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    void loadLive();
    const timer = setInterval(() => void loadLive(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadLive]);

  async function runAction(key: string, action: () => Promise<void>) {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      await loadLive();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(null);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    await runAction('register', async () => {
      await apiFetch('/visits', {
        method: 'POST',
        body: {
          hostUnitId,
          visitorName,
          nationalId,
          ...(plate ? { plate } : {}),
          needsParking,
          expectedAt: new Date().toISOString(),
        },
      });
      setVisitorName('');
      setNationalId('');
      setPlate('');
      setDrawerOpen(false);
    });
  }

  async function handleCheckIn(id: string) {
    await runAction(`in:${id}`, async () => {
      await apiFetch(`/visits/${id}/check-in`, { method: 'POST', body: {} });
    });
  }

  async function handleCheckOut(id: string) {
    await runAction(`out:${id}`, async () => {
      await apiFetch(`/visits/${id}/check-out`, { method: 'POST', body: {} });
    });
  }

  const spots = parkingStatus?.spots ?? [];
  const description =
    parkingStatus?.configured && parkingStatus.freeMinutes !== null
      ? `Modo tablet táctil: tiempo de parqueaderos de visitas (alerta ${parkingStatus.alertMarginMinutes ?? 0} min antes de terminar el tiempo gratuito de ${formatMinutes(parkingStatus.freeMinutes)}).`
      : 'Modo tablet táctil: registro de visitas. Configura los parqueaderos de visitas en Configuración → Parqueaderos.';

  return (
    <section className="internal-page" style={{ fontSize: '15px' }}>
      <ModuleHero
        eyebrow="CONTROL DE ACCESO Y PARQUEADEROS"
        title="Consola de garita"
        description={description}
        icon={Shield}
        actions={
          <button type="button" className="h-btn-dark" style={{ minHeight: '44px', padding: '0 20px', fontSize: '14px' }} onClick={() => setDrawerOpen(true)}>
            <Plus size={16} /> Registrar visita
          </button>
        }
      />

      {loadError && (
        <div className="h-notice h-notice-err" role="alert">
          <span>{loadError}</span>
          <button type="button" className="h-btn-outline" onClick={() => void loadLive()}>
            Reintentar
          </button>
        </div>
      )}
      {actionError && <HabitatToast type="err" text={actionError} onClose={() => setActionError(null)} />}
      {lastUpdated && (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Actualizado {formatTimeInZone(lastUpdated, tenantTimezone)} · se refresca cada minuto
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
        {spots.map((s) => {
          const live = s.occupied ? s.parking : null;
          const isOver = live?.alertLevel === 'OVERTIME';
          const isWarn = live?.alertLevel === 'WARNING';
          const accent = isOver ? '#b7544d' : isWarn ? '#99771f' : s.occupied ? 'var(--primary)' : 'var(--border)';

          return (
            <article
              key={s.spot}
              className="h-panel"
              style={{
                border: `2px solid ${accent}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '16px' }}>
                  <Car size={16} /> Puesto #{s.spot}
                </strong>
                <StatusBadge status={s.occupied ? 'OCCUPIED' : 'AVAILABLE'} />
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: s.occupied ? 600 : 400, color: s.occupied ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                {s.occupied ? `${s.visitorName ?? 'Visita'} · ${s.plate ?? 'Sin placa'}` : 'Disponible'}
              </p>
              {live && (
                <>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: accent }}>
                    <Clock size={16} /> {formatMinutes(live.minutesParked)}
                  </div>
                  <small style={{ color: accent, fontSize: '12.5px' }}>
                    {isOver ? (
                      <>
                        Exceso {formatMinutes(live.overtimeMinutes)} · <Money cents={live.overtimeCentsSoFar} /> hasta ahora
                      </>
                    ) : (
                      `Quedan ${formatMinutes(live.remainingFreeMinutes)} gratis`
                    )}
                  </small>
                </>
              )}
              {s.occupied && s.visitId && (
                <button
                  type="button"
                  className="h-btn-danger"
                  style={{ marginTop: '6px', minHeight: '44px', width: '100%' }}
                  disabled={busy !== null}
                  onClick={() => void handleCheckOut(s.visitId!)}
                >
                  <LogOut size={15} /> {busy === `out:${s.visitId}` ? 'Registrando…' : 'Registrar salida'}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="h-table-wrap">
        <div style={{ padding: '16px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>Visitas recientes</h2>
          <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{visits.length} registros</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Visitante</th>
              <th>Placa</th>
              <th>Puesto</th>
              <th>Exceso</th>
              <th style={{ textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {visits.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted-foreground)', padding: '24px' }}>
                  No hay visitas registradas hoy.
                </td>
              </tr>
            ) : (
              visits.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{v.visitorName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{v.nationalId}</div>
                  </td>
                  <td>{v.plate ?? '—'}</td>
                  <td>{v.parkingSpot ? `#${v.parkingSpot}` : '—'}</td>
                  <td>
                    {v.overtimeCents > 0 ? (
                      <Money cents={v.overtimeCents} />
                    ) : v.parking && v.parking.overtimeCentsSoFar > 0 ? (
                      <span style={{ color: '#b7544d' }}>
                        <Money cents={v.parking.overtimeCentsSoFar} /> (en curso)
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {!v.checkInAt ? (
                      <button type="button" className="h-btn-success" style={{ minHeight: '44px' }} disabled={busy !== null} onClick={() => void handleCheckIn(v.id)}>
                        <LogIn size={15} /> Entrada
                      </button>
                    ) : !v.checkOutAt ? (
                      <button type="button" className="h-btn-danger" style={{ minHeight: '44px' }} disabled={busy !== null} onClick={() => void handleCheckOut(v.id)}>
                        <LogOut size={15} /> Salida
                      </button>
                    ) : (
                      <StatusBadge status="COMPLETED" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <HabitatDrawer
        open={drawerOpen}
        title="Registrar visita"
        subtitle="Ingreso rápido en garita con asignación opcional de parqueadero de visitas."
        onClose={() => setDrawerOpen(false)}
        width={430}
      >
        <form onSubmit={handleRegister} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Unidad anfitriona
            <SearchableSelect
              value={hostUnitId}
              onChange={setHostUnitId}
              searchPlaceholder="Buscar unidad..."
              style={{ minHeight: '44px' }}
              options={units.map((u) => ({
                value: u.id,
                label: `Depto. ${u.number}`,
                keywords: u.number,
              }))}
            />
          </label>
          <label className="h-field">
            Nombre del visitante
            <input required value={visitorName} onChange={(e) => setVisitorName(e.target.value)} className="h-input" style={{ minHeight: '44px' }} />
          </label>
          <label className="h-field">
            Cédula / Pasaporte
            <input required value={nationalId} onChange={(e) => setNationalId(e.target.value)} className="h-input" style={{ minHeight: '44px' }} />
          </label>
          <label className="h-field">
            Placa (opcional)
            <input value={plate} onChange={(e) => setPlate(e.target.value)} className="h-input" style={{ minHeight: '44px' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
            <input type="checkbox" checked={needsParking} onChange={(e) => setNeedsParking(e.target.checked)} style={{ width: '18px', height: '18px' }} />
            Usa parqueadero de visitas
          </label>
          {actionError && <HabitatToast type="err" text={actionError} onClose={() => setActionError(null)} />}
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" style={{ minHeight: '44px' }} onClick={() => setDrawerOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" style={{ minHeight: '44px' }} disabled={busy === 'register'}>
              {busy === 'register' ? 'Guardando…' : 'Guardar visita'}
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
