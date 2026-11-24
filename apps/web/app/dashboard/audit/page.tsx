'use client';

import { useCallback, useEffect, useState } from 'react';
import { Money } from '@noah/ui';
import { useDashboard } from '../../../lib/dashboard-context';
import { downloadCsv } from '../../../lib/export-csv';

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  actorType: string;
  channel: string;
  createdAt: string;
}

interface ReportSummary {
  reservationsByStatus: Array<{ status: string; count: number }>;
  ledgerByType: Array<{ type: string; count: number; totalCents: number }>;
  ticketsByCategory: Array<{ category: string; status: string; count: number }>;
}

export default function AuditPage() {
  const { tenantId, apiFetch } = useDashboard();
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const [l, s] = await Promise.all([
      apiFetch<AuditRow[]>('/audit/logs'),
      apiFetch<ReportSummary>('/audit/reports/summary'),
    ]);
    setLogs(l);
    setSummary(s);
  }, [apiFetch, tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Auditoría y reportes operativos</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Bitácora inmutable de solo inserción y métricas consolidadas del edificio.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            downloadCsv(
              'auditoria-noah.csv',
              ['Fecha', 'Acción', 'Entidad', 'Actor', 'Canal'],
              logs.map((l) => [l.createdAt, l.action, l.entity, l.actorType, l.channel]),
            )
          }
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Exportar bitácora CSV
        </button>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '15px' }}>Reservas por estado</h2>
            {summary.reservationsByStatus.length === 0 ? (
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Sin datos</span>
            ) : (
              summary.reservationsByStatus.map((r) => (
                <div key={r.status} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{r.status}</span>
                  <strong>{r.count}</strong>
                </div>
              ))
            )}
          </div>
          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '15px' }}>Movimientos por concepto</h2>
            {summary.ledgerByType.length === 0 ? (
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Sin datos</span>
            ) : (
              summary.ledgerByType.map((l) => (
                <div key={l.type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{l.type} ({l.count})</span>
                  <strong><Money cents={l.totalCents} /></strong>
                </div>
              ))
            )}
          </div>
          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '15px' }}>Incidencias por categoría</h2>
            {summary.ticketsByCategory.length === 0 ? (
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Sin datos</span>
            ) : (
              summary.ticketsByCategory.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{t.category} ({t.status})</span>
                  <strong>{t.count}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '12px' }}>Fecha (Ecuador)</th>
            <th style={{ padding: '12px' }}>Acción</th>
            <th style={{ padding: '12px' }}>Entidad</th>
            <th style={{ padding: '12px' }}>Canal</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '12px' }}>{new Date(l.createdAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</td>
              <td style={{ padding: '12px', fontFamily: 'monospace' }}>{l.action}</td>
              <td style={{ padding: '12px' }}>{l.entity}</td>
              <td style={{ padding: '12px' }}>{l.channel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
