'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Money, StatusBadge } from '@noah/ui';
import { useDashboard } from '../../../lib/dashboard-context';

interface ReservationRow {
  id: string;
  startsAt: string;
  endsAt: string;
  declaredAttendees: number;
  status: string;
  totalCents: number;
  unit?: { number: string } | null;
  person?: { fullName: string } | null;
  amenities: Array<{ amenity: { id: string; name: string } }>;
}

interface AmenityOption {
  id: string;
  name: string;
  mode: string;
}

interface UnitOption {
  id: string;
  number: string;
}

interface PersonOption {
  id: string;
  fullName: string;
}

interface SimulationResult {
  ok: boolean;
  code?: string;
  message?: string;
  totalCents?: number;
  initialStatus?: string;
  charges?: Array<{ description: string; amountCents: number }>;
}

export default function ReservationsPage() {
  const { me, tenantId, apiFetch } = useDashboard();
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [amenities, setAmenities] = useState<AmenityOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);
  const [unitId, setUnitId] = useState('');
  const [personId, setPersonId] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('16:00');
  const [attendees, setAttendees] = useState('4');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const [res, am, un, pe] = await Promise.all([
      apiFetch<ReservationRow[]>('/reservations'),
      apiFetch<AmenityOption[]>('/catalog/amenities'),
      apiFetch<UnitOption[]>('/cadastre/units'),
      apiFetch<PersonOption[]>('/cadastre/persons'),
    ]);
    setRows(res);
    setAmenities(am.filter((a) => a.mode !== 'FREE_USE'));
    setUnits(un);
    setPersons(pe);
    if (!unitId && un[0]) setUnitId(un[0].id);
    if (!personId && pe[0]) setPersonId(pe[0].id);
  }, [apiFetch, tenantId, unitId, personId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function toggleAmenity(id: string) {
    setSimulation(null);
    setSelectedAmenityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function buildPayload() {
    return {
      unitId,
      personId,
      amenityIds: selectedAmenityIds,
      startsAt: `${date}T${startTime}:00-05:00`,
      endsAt: `${date}T${endTime}:00-05:00`,
      declaredAttendees: Number(attendees),
    };
  }

  async function handleSimulate() {
    setError(null);
    try {
      const result = await apiFetch<SimulationResult>('/reservations/simulate', {
        method: 'POST',
        body: buildPayload(),
      });
      setSimulation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al simular.');
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/reservations', {
        method: 'POST',
        headers: { 'Idempotency-Key': `ui-${Date.now()}` },
        body: buildPayload(),
      });
      setDrawerOpen(false);
      setSimulation(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva.');
    }
  }

  async function handleCancel(id: string) {
    const reason = window.prompt('Motivo obligatorio de cancelación:');
    if (!reason || !reason.trim()) return;
    await apiFetch(`/reservations/${id}/cancel`, { method: 'POST', body: { reason } });
    await loadData();
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Reservas y calendario maestro</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Simulación en vivo con el motor de reglas (R01–R10) y bloqueo transaccional de cupos.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => { setError(null); setSimulation(null); setDrawerOpen(true); }}
            style={{
              padding: '9px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Nueva reserva
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay reservas registradas en este edificio.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px' }}>Área(s)</th>
              <th style={{ padding: '12px' }}>Unidad / Residente</th>
              <th style={{ padding: '12px' }}>Horario (Ecuador)</th>
              <th style={{ padding: '12px' }}>Asistentes</th>
              <th style={{ padding: '12px' }}>Cobro</th>
              <th style={{ padding: '12px' }}>Estado</th>
              <th style={{ padding: '12px' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px', fontWeight: 500 }}>
                  {r.amenities.map((a) => a.amenity.name).join(' + ')}
                </td>
                <td style={{ padding: '12px' }}>
                  {r.unit ? `Depto. ${r.unit.number}` : 'Bloqueo administrativo'}
                  {r.person ? ` · ${r.person.fullName}` : ''}
                </td>
                <td style={{ padding: '12px' }}>
                  {new Date(r.startsAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' })}
                  {' – '}
                  {new Date(r.endsAt).toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', timeStyle: 'short' })}
                </td>
                <td style={{ padding: '12px' }}>{r.declaredAttendees}</td>
                <td style={{ padding: '12px' }}><Money cents={r.totalCents} /></td>
                <td style={{ padding: '12px' }}><StatusBadge status={r.status} /></td>
                <td style={{ padding: '12px' }}>
                  {canManage && ['CONFIRMED', 'PENDING_PAYMENT', 'IN_REVIEW'].includes(r.status) && (
                    <button
                      type="button"
                      onClick={() => handleCancel(r.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-danger)',
                        background: 'transparent',
                        color: 'var(--color-danger)',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drawerOpen && (
        <aside
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '440px',
            backgroundColor: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.14)',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Nueva reserva (con simulación)</h2>
            <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>

          <form onSubmit={handleCreate} style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Unidad
              <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setSimulation(null); }} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                {units.map((u) => <option key={u.id} value={u.id}>Depto. {u.number}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Residente / Solicitante
              <select value={personId} onChange={(e) => { setPersonId(e.target.value); setSimulation(null); }} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                {persons.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </label>
            <div style={{ fontSize: '14px' }}>
              <div style={{ marginBottom: '6px' }}>Área(s) comunal(es) (puedes marcar combo):</div>
              <div style={{ display: 'grid', gap: '4px', maxHeight: '140px', overflowY: 'auto', padding: '8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                {amenities.map((a) => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <input type="checkbox" checked={selectedAmenityIds.includes(a.id)} onChange={() => toggleAmenity(a.id)} />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Fecha
                <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSimulation(null); }} style={{ padding: '6px', border: '1px solid var(--color-border)' }} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Inicio
                <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setSimulation(null); }} style={{ padding: '6px', border: '1px solid var(--color-border)' }} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Fin
                <input type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setSimulation(null); }} style={{ padding: '6px', border: '1px solid var(--color-border)' }} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Asistentes declarados (incluye residente)
              <input type="number" min={1} value={attendees} onChange={(e) => { setAttendees(e.target.value); setSimulation(null); }} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>

            <button
              type="button"
              onClick={handleSimulate}
              disabled={selectedAmenityIds.length === 0}
              style={{
                padding: '9px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-primary)',
                backgroundColor: 'transparent',
                color: 'var(--color-primary)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Simular reglas y cobros
            </button>

            {simulation && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${simulation.ok ? 'var(--color-success)' : 'var(--color-danger)'}`,
                  fontSize: '13px',
                }}
              >
                {simulation.ok ? (
                  <>
                    <strong style={{ color: 'var(--color-success)' }}>Reserva válida</strong>
                    <div style={{ marginTop: '6px' }}>Estado inicial: <StatusBadge status={simulation.initialStatus ?? 'CONFIRMED'} /></div>
                    {simulation.charges?.map((c, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                        <span>{c.description}</span>
                        <Money cents={c.amountCents} />
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid var(--color-border)', fontWeight: 700 }}>
                      <span>Total</span>
                      <Money cents={simulation.totalCents ?? 0} />
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--color-danger)' }}>
                    <strong>Rechazada ({simulation.code}):</strong> {simulation.message}
                  </div>
                )}
              </div>
            )}

            {error && <div style={{ color: 'var(--color-danger)', fontSize: '13px' }}>{error}</div>}

            <button
              type="submit"
              disabled={!simulation?.ok}
              style={{
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: simulation?.ok ? 'var(--color-primary)' : 'var(--color-border)',
                color: '#ffffff',
                fontWeight: 600,
                cursor: simulation?.ok ? 'pointer' : 'not-allowed',
              }}
            >
              Confirmar reserva
            </button>
          </form>
        </aside>
      )}
    </section>
  );
}
