'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, Pencil, Plus, QrCode, Sparkles } from 'lucide-react';
import { Money, StatusBadge } from '@noah/ui';
import { HabitatDrawer, HabitatToast, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { QrTicketDrawer } from '../../../components/qr-ticket-drawer';
import { useDashboard } from '../../../lib/dashboard-context';

interface ReservationRow {
  id: string;
  startsAt: string;
  endsAt: string;
  declaredAttendees: number;
  status: string;
  totalCents: number;
  unit?: { id: string; number: string } | null;
  person?: { id: string; fullName: string; waPhone?: string | null } | null;
  amenities: Array<{ amenity: { id: string; name: string } }>;
  credentials?: Array<{ id: string; employeeNo: string; code: string; syncStatus: string }>;
}

function toEcuadorDateInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '01';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toEcuadorTimeInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${hour}:${get('minute')}`;
}

interface AmenityOption {
  id: string;
  name: string;
  mode: string;
}

interface UnitOccupancyOption {
  id: string;
  personId: string;
  role: string;
  validFrom: string;
  validTo: string | null;
  person: {
    id: string;
    fullName: string;
    waPhone: string;
  };
}

interface UnitOption {
  id: string;
  number: string;
  occupancies: UnitOccupancyOption[];
}

const OCCUPANCY_ROLE_LABELS: Record<string, string> = {
  OWNER_RESIDENT: 'Propietario residente',
  OWNER_LANDLORD: 'Propietario arrendador',
  LONG_TERM_TENANT: 'Arrendatario fijo',
  AIRBNB_HOST: 'Anfitrión renta corta',
  AIRBNB_GUEST: 'Huésped renta corta',
};

function getActiveOccupancies(unit: UnitOption | undefined): UnitOccupancyOption[] {
  if (!unit) return [];
  const now = Date.now();
  return unit.occupancies.filter((o) => {
    const from = new Date(o.validFrom).getTime();
    const to = o.validTo ? new Date(o.validTo).getTime() : Infinity;
    return from <= now && now <= to;
  });
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);
  const [ticketReservationId, setTicketReservationId] = useState<string | null>(null);

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
    const [res, am, un] = await Promise.all([
      apiFetch<ReservationRow[]>('/reservations'),
      apiFetch<AmenityOption[]>('/catalog/amenities'),
      apiFetch<UnitOption[]>('/cadastre/units'),
    ]);
    setRows(res);
    setAmenities(am.filter((a) => a.mode !== 'FREE_USE'));
    setUnits(un);
    if (!unitId && un.length > 0) {
      const firstWithOccupant = un.find((u) => getActiveOccupancies(u).length > 0) ?? un[0]!;
      setUnitId(firstWithOccupant.id);
      const activeOccs = getActiveOccupancies(firstWithOccupant);
      setPersonId(activeOccs[0]?.personId ?? '');
    }
  }, [apiFetch, tenantId, unitId]);

  const selectedUnit = units.find((u) => u.id === unitId);
  const activeOccupancies = getActiveOccupancies(selectedUnit);
  const selectedOccupancy = activeOccupancies.find((o) => o.personId === personId);

  function handleUnitChange(nextUnitId: string) {
    setUnitId(nextUnitId);
    setSimulation(null);
    const nextUnit = units.find((u) => u.id === nextUnitId);
    const nextActive = getActiveOccupancies(nextUnit);
    setPersonId(nextActive[0]?.personId ?? '');
  }

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function toggleAmenity(id: string) {
    setSimulation(null);
    setSelectedAmenityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function openNewDrawer() {
    setEditingReservationId(null);
    setError(null);
    setSimulation(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(row: ReservationRow) {
    setEditingReservationId(row.id);
    if (row.unit?.id) setUnitId(row.unit.id);
    if (row.person?.id) setPersonId(row.person.id);
    setSelectedAmenityIds(row.amenities.map((a) => a.amenity.id));
    setDate(toEcuadorDateInput(row.startsAt));
    setStartTime(toEcuadorTimeInput(row.startsAt));
    setEndTime(toEcuadorTimeInput(row.endsAt));
    setAttendees(String(row.declaredAttendees));
    setError(null);
    setSimulation(null);
    setDrawerOpen(true);
  }

  function buildPayload() {
    return {
      unitId,
      personId,
      amenityIds: selectedAmenityIds,
      startsAt: `${date}T${startTime}:00-05:00`,
      endsAt: `${date}T${endTime}:00-05:00`,
      declaredAttendees: Number(attendees),
      ...(editingReservationId ? { excludeReservationId: editingReservationId } : {}),
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingReservationId) {
        const updated = await apiFetch<{ id: string; status: string }>(
          `/reservations/${editingReservationId}`,
          {
            method: 'PATCH',
            body: {
              amenityIds: selectedAmenityIds,
              startsAt: `${date}T${startTime}:00-05:00`,
              endsAt: `${date}T${endTime}:00-05:00`,
              declaredAttendees: Number(attendees),
            },
          },
        );
        setDrawerOpen(false);
        setEditingReservationId(null);
        setSimulation(null);
        setToast(
          updated.status === 'CONFIRMED'
            ? 'Reserva actualizada y QR re-sincronizado con Hikvision.'
            : 'Reserva actualizada correctamente.',
        );
        await loadData();
        return;
      }

      const created = await apiFetch<{ id: string; status: string }>('/reservations', {
        method: 'POST',
        headers: { 'Idempotency-Key': `ui-${Date.now()}` },
        body: buildPayload(),
      });
      setDrawerOpen(false);
      setSimulation(null);
      setToast(
        created.status === 'CONFIRMED'
          ? 'Reserva confirmada y ticket QR generado.'
          : 'Reserva registrada. El ticket QR se activará al aprobar el pago.',
      );
      await loadData();
      if (created.status === 'CONFIRMED') {
        setTicketReservationId(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la reserva.');
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
              onClick={openNewDrawer}
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
                      <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {r.status === 'CONFIRMED' && (
                          <button
                            type="button"
                            className="h-btn-outline h-btn-sm"
                            onClick={() => setTicketReservationId(r.id)}
                          >
                            <QrCode size={13} /> Ticket QR
                          </button>
                        )}
                        {['CONFIRMED', 'PENDING_PAYMENT', 'IN_REVIEW'].includes(r.status) && r.unit && (
                          <button
                            type="button"
                            className="h-btn-outline h-btn-sm"
                            onClick={() => openEditDrawer(r)}
                          >
                            <Pencil size={13} /> Editar
                          </button>
                        )}
                        {['CONFIRMED', 'PENDING_PAYMENT', 'IN_REVIEW'].includes(r.status) && (
                          <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleCancel(r.id)}>
                            Cancelar
                          </button>
                        )}
                      </div>
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
        title={editingReservationId ? 'Editar reserva' : 'Nueva reserva'}
        subtitle={
          editingReservationId
            ? 'Modifica espacio, fecha, horario o asistentes. Si está confirmada, el QR se actualiza automáticamente en Hikvision.'
            : 'Simula contra el motor de reglas (mora, garantía, rol, aforo y combos) antes de confirmar.'
        }
        onClose={() => {
          setDrawerOpen(false);
          setEditingReservationId(null);
        }}
        width={480}
      >
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Unidad
            <SearchableSelect
              value={unitId}
              disabled={Boolean(editingReservationId)}
              onChange={(val) => handleUnitChange(val)}
              searchPlaceholder="Buscar unidad..."
              options={units.map((u) => {
                const count = getActiveOccupancies(u).length;
                return {
                  value: u.id,
                  label: `Depto. ${u.number} ${count === 0 ? '(sin residente activo)' : `(${count})`}`,
                  keywords: u.number,
                };
              })}
            />
          </label>
          <label className="h-field">
            Residente / Solicitante (vinculado a la unidad)
            {activeOccupancies.length === 0 ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#fae9e6',
                  color: '#b7544d',
                  fontSize: '12.5px',
                }}
              >
                Esta unidad no tiene ocupantes activos en Catastro. Asigna un residente primero o selecciona otra unidad.
              </div>
            ) : (
              <>
                <SearchableSelect
                  value={personId}
                  disabled={Boolean(editingReservationId)}
                  onChange={(val) => {
                    setPersonId(val);
                    setSimulation(null);
                  }}
                  searchPlaceholder="Buscar residente o teléfono..."
                  options={activeOccupancies.map((occ) => ({
                    value: occ.personId,
                    label: `${occ.person.fullName} · ${OCCUPANCY_ROLE_LABELS[occ.role] ?? occ.role}`,
                    keywords: occ.person.waPhone,
                  }))}
                />
                {selectedOccupancy && (
                  <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                    WhatsApp vinculado: <strong>{selectedOccupancy.person.waPhone}</strong>
                  </span>
                )}
              </>
            )}
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

          <button
            type="button"
            className="h-btn-outline"
            onClick={() => void handleSimulate()}
            disabled={selectedAmenityIds.length === 0 || !personId}
          >
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
              {editingReservationId ? 'Guardar cambios' : 'Confirmar reserva'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <QrTicketDrawer
        reservationId={ticketReservationId}
        onClose={() => {
          setTicketReservationId(null);
          void loadData();
        }}
      />
    </section>
  );
}
