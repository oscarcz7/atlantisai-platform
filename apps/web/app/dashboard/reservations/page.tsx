'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, Plus, Sparkles } from 'lucide-react';
import { Money, StatusBadge } from '@noah/ui';
import { HabitatDrawer, HabitatToast, ModuleHero } from '../../../components/habitat-ui';
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
  const [toast, setToast] = useState<string | null>(null);

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
      setToast('Reserva registrada correctamente.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva.');
    }
  }

  async function handleCancel(id: string) {
    const reason = window.prompt('Motivo obligatorio de cancelación:');
    if (!reason || !reason.trim()) return;
    await apiFetch(`/reservations/${id}/cancel`, { method: 'POST', body: { reason } });
    setToast('Reserva cancelada y registrada en auditoría.');
    await loadData();
  }

  const confirmedCount = rows.filter((r) => r.status === 'CONFIRMED').length;
  const pendingCount = rows.filter((r) => r.status === 'PENDING_PAYMENT' || r.status === 'IN_REVIEW').length;

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="ÁREAS COMUNALES"
        title="Reservas y calendario maestro"
        description="Simulación en vivo con el motor de reglas (R01–R10), cálculo de combos y bloqueo transaccional de cupos."
        icon={CalendarDays}
        actions={
          canManage && (
            <button
              type="button"
              className="h-btn-dark"
              onClick={() => {
                setError(null);
                setSimulation(null);
                setDrawerOpen(true);
              }}
            >
              <Plus size={15} /> Nueva reserva
            </button>
          )
        }
      />

      {toast && <HabitatToast type="ok" text={toast} onClose={() => setToast(null)} />}

      <div className="h-kpi-strip">
        <article className="h-kpi-card">
          <span>Reservas confirmadas</span>
          <strong>{String(confirmedCount).padStart(2, '0')}</strong>
          <small>listas para acceso</small>
        </article>
        <article className="h-kpi-card">
          <span>En revisión / pago</span>
          <strong>{String(pendingCount).padStart(2, '0')}</strong>
          <small>esperando comprobante</small>
        </article>
        <article className="h-kpi-card">
          <span>Total histórico</span>
          <strong>{rows.length}</strong>
          <small>en este edificio</small>
        </article>
      </div>

      {rows.length === 0 ? (
        <div className="h-panel" style={{ color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
          Aún no hay reservas registradas en este edificio.
        </div>
      ) : (
        <div className="h-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Área(s)</th>
                <th>Unidad / Residente</th>
                <th>Horario (Ecuador)</th>
                <th>Asistentes</th>
                <th>Cobro</th>
                <th>Estado</th>
                {canManage && <th style={{ textAlign: 'right' }}>Acción</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.amenities.map((a) => a.amenity.name).join(' + ')}</td>
                  <td>
                    {r.unit ? `Depto. ${r.unit.number}` : 'Bloqueo administrativo'}
                    {r.person ? ` · ${r.person.fullName}` : ''}
                  </td>
                  <td style={{ fontSize: '12.5px', color: 'var(--muted-foreground)' }}>
                    {new Date(r.startsAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' })}
                    {' – '}
                    {new Date(r.endsAt).toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', timeStyle: 'short' })}
                  </td>
                  <td>{r.declaredAttendees}</td>
                  <td>
                    <Money cents={r.totalCents} />
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      {['CONFIRMED', 'PENDING_PAYMENT', 'IN_REVIEW'].includes(r.status) && (
                        <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleCancel(r.id)}>
                          Cancelar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HabitatDrawer
        open={drawerOpen}
        title="Nueva reserva"
        subtitle="Simula contra el motor de reglas (mora, garantía, rol, aforo y combos) antes de confirmar."
        onClose={() => setDrawerOpen(false)}
        width={480}
      >
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Unidad
            <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setSimulation(null); }} className="h-input">
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  Depto. {u.number}
                </option>
              ))}
            </select>
          </label>
          <label className="h-field">
            Residente / Solicitante
            <select value={personId} onChange={(e) => { setPersonId(e.target.value); setSimulation(null); }} className="h-input">
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </label>
          <div className="h-field">
            <span>Área(s) comunal(es) (puedes marcar combo)</span>
            <div style={{ display: 'grid', gap: '6px', maxHeight: '150px', overflowY: 'auto', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--background)' }}>
              {amenities.map((a) => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 400 }}>
                  <input type="checkbox" checked={selectedAmenityIds.includes(a.id)} onChange={() => toggleAmenity(a.id)} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
            <label className="h-field">
              Fecha
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSimulation(null); }} className="h-input" />
            </label>
            <label className="h-field">
              Inicio
              <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setSimulation(null); }} className="h-input" />
            </label>
            <label className="h-field">
              Fin
              <input type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setSimulation(null); }} className="h-input" />
            </label>
          </div>
          <label className="h-field">
            Asistentes declarados (incluye residente)
            <input type="number" min={1} value={attendees} onChange={(e) => { setAttendees(e.target.value); setSimulation(null); }} className="h-input" />
          </label>

          <button type="button" className="h-btn-outline" onClick={() => void handleSimulate()} disabled={selectedAmenityIds.length === 0}>
            <Sparkles size={14} /> Simular reglas y cobros
          </button>

          {simulation && (
            <div
              style={{
                padding: '14px',
                borderRadius: '14px',
                background: simulation.ok ? '#edf5ef' : '#fae9e6',
                border: `1px solid ${simulation.ok ? '#cde4d4' : '#f0cac3'}`,
                fontSize: '13px',
              }}
            >
              {simulation.ok ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#39866b', fontWeight: 700 }}>
                    <Check size={15} /> Reserva válida
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    Estado inicial: <StatusBadge status={simulation.initialStatus ?? 'CONFIRMED'} />
                  </div>
                  {simulation.charges?.map((c, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span>{c.description}</span>
                      <Money cents={c.amountCents} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #cde4d4', fontWeight: 700 }}>
                    <span>Total</span>
                    <Money cents={simulation.totalCents ?? 0} />
                  </div>
                </>
              ) : (
                <div style={{ color: '#b7544d' }}>
                  <strong>Rechazada ({simulation.code}):</strong> {simulation.message}
                </div>
              )}
            </div>
          )}

          {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}

          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={!simulation?.ok} className="h-btn-dark">
              Confirmar reserva
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
