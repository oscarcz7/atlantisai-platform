'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Money, StatusBadge } from '@noah/ui';
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
    <section style={{ fontSize: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Consola de garita</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Cronómetro de parqueaderos de visitas (amarillo a las 2 h 45 m, rojo al superar {freeMinutes / 60} h).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          style={{
            minHeight: '44px',
            padding: '10px 18px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '15px',
            cursor: 'pointer',
          }}
        >
          + Registrar visita
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {spots.map((s) => {
          const elapsed = s.checkInAt ? formatElapsed(s.checkInAt, nowMs) : null;
          const borderColor = !s.occupied
            ? 'var(--color-border)'
            : elapsed && elapsed.minutes >= freeMinutes
              ? 'var(--color-danger)'
              : elapsed && elapsed.minutes >= freeMinutes - 15
                ? 'var(--color-warning)'
                : 'var(--color-primary)';

          return (
            <article
              key={s.spot}
              style={{
                padding: '18px',
                backgroundColor: 'var(--color-surface)',
                border: `2px solid ${borderColor}`,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Puesto #{s.spot}</strong>
                <StatusBadge status={s.occupied ? 'PENDING_PAYMENT' : 'OK'} />
              </div>
              <p style={{ margin: '10px 0 4px', fontSize: '15px' }}>
                {s.occupied ? `${s.visitorName ?? 'Visita'} · ${s.plate ?? 'Sin placa'}` : 'Disponible'}
              </p>
              {elapsed && (
                <div style={{ fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: borderColor }}>
                  {elapsed.text}
                </div>
              )}
              {s.occupied && s.visitId && (
                <button
                  type="button"
                  onClick={() => handleCheckOut(s.visitId!)}
                  style={{
                    marginTop: '12px',
                    minHeight: '44px',
                    width: '100%',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-danger)',
                    backgroundColor: 'transparent',
                    color: 'var(--color-danger)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Registrar salida
                </button>
              )}
            </article>
          );
        })}
      </div>

      <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Visitas recientes</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '12px' }}>Visitante</th>
            <th style={{ padding: '12px' }}>Placa</th>
            <th style={{ padding: '12px' }}>Puesto</th>
            <th style={{ padding: '12px' }}>Exceso</th>
            <th style={{ padding: '12px' }}>Acción</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => (
            <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '12px' }}>
                <div style={{ fontWeight: 600 }}>{v.visitorName}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{v.nationalId}</div>
              </td>
              <td style={{ padding: '12px' }}>{v.plate ?? '—'}</td>
              <td style={{ padding: '12px' }}>{v.parkingSpot ? `#${v.parkingSpot}` : '—'}</td>
              <td style={{ padding: '12px' }}>{v.overtimeCents > 0 ? <Money cents={v.overtimeCents} /> : '—'}</td>
              <td style={{ padding: '12px' }}>
                {!v.checkInAt ? (
                  <button
                    type="button"
                    onClick={() => handleCheckIn(v.id)}
                    style={{ minHeight: '44px', padding: '0 14px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--color-success)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Entrada
                  </button>
                ) : !v.checkOutAt ? (
                  <button
                    type="button"
                    onClick={() => handleCheckOut(v.id)}
                    style={{ minHeight: '44px', padding: '0 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Salida
                  </button>
                ) : (
                  <StatusBadge status="COMPLETED" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {drawerOpen && (
        <aside
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '380px',
            backgroundColor: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.14)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Registrar visita</h2>
            <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>
          <form onSubmit={handleRegister} style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Unidad anfitriona
              <select value={hostUnitId} onChange={(e) => setHostUnitId(e.target.value)} style={{ padding: '10px', border: '1px solid var(--color-border)' }}>
                {units.map((u) => <option key={u.id} value={u.id}>Depto. {u.number}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Nombre del visitante
              <input required value={visitorName} onChange={(e) => setVisitorName(e.target.value)} style={{ padding: '10px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Cédula / Pasaporte
              <input required value={nationalId} onChange={(e) => setNationalId(e.target.value)} style={{ padding: '10px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Placa (opcional)
              <input value={plate} onChange={(e) => setPlate(e.target.value)} style={{ padding: '10px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input type="checkbox" checked={needsParking} onChange={(e) => setNeedsParking(e.target.checked)} />
              Usa parqueadero de visitas
            </label>
            <button type="submit" style={{ minHeight: '44px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
              Guardar visita
            </button>
          </form>
        </aside>
      )}
    </section>
  );
}
