'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Car, Clock, LogIn, LogOut, Plus, Shield } from 'lucide-react';
import { Money, StatusBadge } from '@noah/ui';
import { HabitatDrawer, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { useDashboard } from '../../../lib/dashboard-context';

interface ParkingSpot {
  spot: number;
  occupied: boolean;
  visitId: string | null;
  visitorName: string | null;
  plate: string | null;
  checkInAt: string | null;
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
}

interface UnitOption {
  id: string;
  number: string;
}

function formatElapsed(checkInIso: string, nowMs: number): { text: string; minutes: number } {
  const diffMin = Math.max(0, Math.floor((nowMs - new Date(checkInIso).getTime()) / 60_000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return { text: `${h}h ${String(m).padStart(2, '0')}m`, minutes: diffMin };
}

export default function GaritaConsolePage() {
  const { tenantId, apiFetch } = useDashboard();
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [freeMinutes, setFreeMinutes] = useState(180);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [hostUnitId, setHostUnitId] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [plate, setPlate] = useState('');
  const [needsParking, setNeedsParking] = useState(true);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const [pk, vis, un] = await Promise.all([
      apiFetch<{ freeMinutes: number; spots: ParkingSpot[] }>('/visits/parking-status'),
      apiFetch<VisitRow[]>('/visits'),
      apiFetch<UnitOption[]>('/cadastre/units'),
    ]);
    setFreeMinutes(pk.freeMinutes);
    setSpots(pk.spots);
    setVisits(vis);
    setUnits(un);
    if (!hostUnitId && un[0]) setHostUnitId(un[0].id);
  }, [apiFetch, tenantId, hostUnitId]);

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [loadData]);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
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
    await loadData();
  }

  async function handleCheckIn(id: string) {
    await apiFetch(`/visits/${id}/check-in`, { method: 'POST', body: {} });
    await loadData();
  }

  async function handleCheckOut(id: string) {
    await apiFetch(`/visits/${id}/check-out`, { method: 'POST', body: {} });
    await loadData();
  }

  return (
    <section className="internal-page" style={{ fontSize: '15px' }}>
      <ModuleHero
        eyebrow="CONTROL DE ACCESO Y PARQUEADEROS"
        title="Consola de garita"
        description={`Modo tablet táctil: cronómetro en vivo de parqueaderos de visitas (alerta a 2h45m, exceso al superar ${freeMinutes / 60} h).`}
        icon={Shield}
        actions={
          <button type="button" className="h-btn-dark" style={{ minHeight: '44px', padding: '0 20px', fontSize: '14px' }} onClick={() => setDrawerOpen(true)}>
            <Plus size={16} /> Registrar visita
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
        {spots.map((s) => {
          const elapsed = s.checkInAt ? formatElapsed(s.checkInAt, nowMs) : null;
          const isOver = Boolean(s.occupied && elapsed && elapsed.minutes >= freeMinutes);
          const isWarn = Boolean(s.occupied && elapsed && !isOver && elapsed.minutes >= freeMinutes - 15);
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
              {elapsed && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: accent }}>
                  <Clock size={16} /> {elapsed.text}
                </div>
              )}
              {s.occupied && s.visitId && (
                <button
                  type="button"
                  className="h-btn-danger"
                  style={{ marginTop: '6px', minHeight: '44px', width: '100%' }}
                  onClick={() => void handleCheckOut(s.visitId!)}
                >
                  <LogOut size={15} /> Registrar salida
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
                  <td>{v.overtimeCents > 0 ? <Money cents={v.overtimeCents} /> : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {!v.checkInAt ? (
                      <button type="button" className="h-btn-success" style={{ minHeight: '44px' }} onClick={() => void handleCheckIn(v.id)}>
                        <LogIn size={15} /> Entrada
                      </button>
                    ) : !v.checkOutAt ? (
                      <button type="button" className="h-btn-danger" style={{ minHeight: '44px' }} onClick={() => void handleCheckOut(v.id)}>
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
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" style={{ minHeight: '44px' }} onClick={() => setDrawerOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" style={{ minHeight: '44px' }}>
              Guardar visita
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
