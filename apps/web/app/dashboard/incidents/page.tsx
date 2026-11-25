'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Wrench } from 'lucide-react';
import { StatusBadge } from '@noah/ui';
import { HabitatDrawer, HabitatToast, ModuleHero } from '../../../components/habitat-ui';
import { useDashboard } from '../../../lib/dashboard-context';

interface TicketRow {
  id: string;
  category: string;
  location: string;
  description: string;
  urgency: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
}

const URGENCY_META: Record<string, { label: string; bg: string; fg: string }> = {
  EMERGENCY: { label: 'Emergencia', bg: '#fae9e6', fg: '#b7544d' },
  HIGH: { label: 'Alta', bg: '#fae9e6', fg: '#b7544d' },
  MEDIUM: { label: 'Media', bg: '#f8f0dc', fg: '#99771f' },
  LOW: { label: 'Baja', bg: '#e9f2ec', fg: '#52816c' },
};

export default function IncidentsPage() {
  const { me, tenantId, apiFetch } = useDashboard();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [category, setCategory] = useState('Mantenimiento');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('MEDIUM');
  const [notice, setNotice] = useState<string | null>(null);

  const canChangeStatus = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const rows = await apiFetch<TicketRow[]>('/incidents');
    setTickets(rows);
  }, [apiFetch, tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const res = await apiFetch<{ possibleDuplicates: Array<{ id: string }> }>('/incidents', {
      method: 'POST',
      body: { category, location, description, urgency },
    });
    setLocation('');
    setDescription('');
    setDrawerOpen(false);
    setNotice(
      res.possibleDuplicates.length > 0
        ? `Ticket creado (aviso: se detectaron ${res.possibleDuplicates.length} ticket(s) similar(es) en las últimas 48 h).`
        : 'Ticket registrado correctamente.',
    );
    await loadData();
  }

  async function handleStatusChange(id: string, status: TicketRow['status']) {
    await apiFetch(`/incidents/${id}/status`, { method: 'PATCH', body: { status } });
    setNotice('Estado del ticket actualizado.');
    await loadData();
  }

  const openCount = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
  const highCount = tickets.filter((t) => t.urgency === 'HIGH' || t.urgency === 'EMERGENCY').length;

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="MANTENIMIENTO Y PQRS"
        title="Incidencias"
        description="Reportes con detección automática de duplicados en ventana de 48 horas y trazabilidad de cierre."
        icon={Wrench}
        actions={
          <button type="button" className="h-btn-dark" onClick={() => setDrawerOpen(true)}>
            <Plus size={15} /> Nuevo ticket
          </button>
        }
      />

      {notice && <HabitatToast type="ok" text={notice} onClose={() => setNotice(null)} />}

      <div className="h-kpi-strip">
        <article className="h-kpi-card">
          <span>Abiertas / En proceso</span>
          <strong>{String(openCount).padStart(2, '0')}</strong>
          <small>requieren seguimiento</small>
        </article>
        <article className="h-kpi-card">
          <span>Alta / Emergencia</span>
          <strong>{String(highCount).padStart(2, '0')}</strong>
          <small>prioridad crítica</small>
        </article>
        <article className="h-kpi-card">
          <span>Total tickets</span>
          <strong>{tickets.length}</strong>
          <small>registrados en el edificio</small>
        </article>
      </div>

      {tickets.length === 0 ? (
        <div className="h-panel" style={{ color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
          No hay incidencias registradas.
        </div>
      ) : (
        <div className="h-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Ubicación</th>
                <th>Descripción</th>
                <th>Urgencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const urg = URGENCY_META[t.urgency] ?? URGENCY_META.MEDIUM!;
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.category}</td>
                    <td>{t.location}</td>
                    <td style={{ maxWidth: '340px' }}>{t.description}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: urg.bg,
                          color: urg.fg,
                        }}
                      >
                        {urg.label}
                      </span>
                    </td>
                    <td>
                      {canChangeStatus ? (
                        <select
                          value={t.status}
                          onChange={(e) => void handleStatusChange(t.id, e.target.value as TicketRow['status'])}
                          className="h-input"
                          style={{ padding: '6px 10px', width: 'auto', fontSize: '12.5px' }}
                        >
                          <option value="OPEN">Abierto</option>
                          <option value="IN_PROGRESS">En proceso</option>
                          <option value="RESOLVED">Resuelto</option>
                          <option value="CLOSED">Cerrado</option>
                        </select>
                      ) : (
                        <StatusBadge status={t.status === 'CLOSED' || t.status === 'RESOLVED' ? 'COMPLETED' : 'IN_REVIEW'} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <HabitatDrawer
        open={drawerOpen}
        title="Reportar incidencia"
        subtitle="Si existe un reporte similar en las últimas 48 h, el sistema mostrará un aviso automáticamente."
        onClose={() => setDrawerOpen(false)}
        width={440}
      >
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Categoría
            <input required value={category} onChange={(e) => setCategory(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Ubicación
            <input required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej. Lobby, Ascensor, Área común" className="h-input" />
          </label>
          <label className="h-field">
            Urgencia
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="h-input">
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="EMERGENCY">Emergencia</option>
            </select>
          </label>
          <label className="h-field">
            Descripción
            <textarea required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="h-input" />
          </label>
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark">
              Crear ticket
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
