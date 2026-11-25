'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Download } from 'lucide-react';
import { Money } from '@noah/ui';
import { ModuleHero } from '../../../components/habitat-ui';
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
    <section className="internal-page">
      <ModuleHero
        eyebrow="TRAZABILIDAD Y REPORTES"
        title="Auditoría y reportes operativos"
        description="Bitácora inmutable de solo inserción y métricas consolidadas del edificio listas para exportar."
        icon={Activity}
        actions={
          <button
            type="button"
            className="h-btn-dark"
            onClick={() =>
              downloadCsv(
                'auditoria-noah.csv',
                ['Fecha', 'Acción', 'Entidad', 'Actor', 'Canal'],
                logs.map((l) => [l.createdAt, l.action, l.entity, l.actorType, l.channel]),
              )
            }
          >
            <Download size={14} /> Exportar bitácora CSV
          </button>
        }
      />

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          <div className="h-panel">
            <h2 style={{ margin: '0 0 12px', fontSize: '15px' }}>Reservas por estado</h2>
            {summary.reservationsByStatus.length === 0 ? (
              <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Sin datos</span>
            ) : (
              summary.reservationsByStatus.map((r) => (
                <div key={r.status} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderTop: '1px solid #f0eee9' }}>
                  <span>{r.status}</span>
                  <strong>{r.count}</strong>
                </div>
              ))
            )}
          </div>
          <div className="h-panel">
            <h2 style={{ margin: '0 0 12px', fontSize: '15px' }}>Movimientos por concepto</h2>
            {summary.ledgerByType.length === 0 ? (
              <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Sin datos</span>
            ) : (
              summary.ledgerByType.map((l) => (
                <div key={l.type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderTop: '1px solid #f0eee9' }}>
                  <span>{l.type} ({l.count})</span>
                  <strong>
                    <Money cents={l.totalCents} />
                  </strong>
                </div>
              ))
            )}
          </div>
          <div className="h-panel">
            <h2 style={{ margin: '0 0 12px', fontSize: '15px' }}>Incidencias por categoría</h2>
            {summary.ticketsByCategory.length === 0 ? (
              <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Sin datos</span>
            ) : (
              summary.ticketsByCategory.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderTop: '1px solid #f0eee9' }}>
                  <span>{t.category} ({t.status})</span>
                  <strong>{t.count}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="h-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha (Ecuador)</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Canal</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted-foreground)' }}>
                  No hay eventos registrados aún.
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontSize: '12.5px', color: 'var(--muted-foreground)' }}>
                    {new Date(l.createdAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{l.action}</td>
                  <td>{l.entity}</td>
                  <td>{l.channel}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
