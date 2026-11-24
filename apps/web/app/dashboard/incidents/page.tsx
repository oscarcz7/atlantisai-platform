'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StatusBadge } from '@noah/ui';
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
    await loadData();
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Incidencias</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Reportes con aviso de duplicados en 48 horas y trazabilidad de cierre.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
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
          + Nuevo ticket
        </button>
      </div>

      {notice && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info)', color: 'var(--color-info)', fontSize: '13px' }}>
          {notice}
        </div>
      )}

      {tickets.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No hay incidencias registradas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px' }}>Categoría</th>
              <th style={{ padding: '12px' }}>Ubicación</th>
              <th style={{ padding: '12px' }}>Descripción</th>
              <th style={{ padding: '12px' }}>Urgencia</th>
              <th style={{ padding: '12px' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px', fontWeight: 600 }}>{t.category}</td>
                <td style={{ padding: '12px' }}>{t.location}</td>
                <td style={{ padding: '12px' }}>{t.description}</td>
                <td style={{ padding: '12px' }}>{t.urgency}</td>
                <td style={{ padding: '12px' }}>
                  {canChangeStatus ? (
                    <select
                      value={t.status}
                      onChange={(e) => handleStatusChange(t.id, e.target.value as TicketRow['status'])}
                      style={{ padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                    >
                      <option value="OPEN">Abierto</option>
                      <option value="IN_PROGRESS">En proceso</option>
                      <option value="RESOLVED">Resuelto</option>
                      <option value="CLOSED">Cerrado</option>
                    </select>
                  ) : (
                    <StatusBadge status={t.status === 'CLOSED' ? 'COMPLETED' : 'IN_REVIEW'} />
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
            width: '380px',
            backgroundColor: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.14)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Reportar incidencia</h2>
            <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>
          <form onSubmit={handleCreate} style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Categoría
              <input required value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Ubicación
              <input required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej. Ascensor 1, Piscina" style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Urgencia
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
                <option value="EMERGENCY">Emergencia</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Descripción
              <textarea required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <button type="submit" style={{ padding: '10px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
              Crear ticket
            </button>
          </form>
        </aside>
      )}
    </section>
  );
}
