'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Money, StatusBadge } from '@noah/ui';
import { useDashboard } from '../../../lib/dashboard-context';

interface PaymentProofRow {
  id: string;
  unitId: string;
  reservationId?: string | null;
  bank: string;
  amountCents: number;
  reference: string;
  status: string;
  transferDate: string;
  rejectionReason?: string | null;
}

interface UnitOption {
  id: string;
  number: string;
}

export default function BillingPage() {
  const { me, tenantId, apiFetch } = useDashboard();
  const [proofs, setProofs] = useState<PaymentProofRow[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selected, setSelected] = useState<PaymentProofRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [unitId, setUnitId] = useState('');
  const [bank, setBank] = useState('Banco Pichincha');
  const [amountUsd, setAmountUsd] = useState('50.00');
  const [reference, setReference] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));

  const isAccountant = me.role === 'SUPERADMIN' || me.role === 'ACCOUNTANT';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const u = await apiFetch<UnitOption[]>('/cadastre/units');
    setUnits(u);
    if (!unitId && u[0]) setUnitId(u[0].id);
    if (isAccountant) {
      const p = await apiFetch<PaymentProofRow[]>('/billing/payment-proofs');
      setProofs(p);
      setSelected((prev) => (prev ? p.find((x) => x.id === prev.id) ?? null : p[0] ?? null));
    }
  }, [apiFetch, tenantId, isAccountant, unitId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSubmitProof(e: FormEvent) {
    e.preventDefault();
    const res = await apiFetch<{ possibleDuplicate: boolean }>('/billing/payment-proofs', {
      method: 'POST',
      body: {
        unitId,
        fileKey: `manual/${reference}.pdf`,
        bank,
        amountCents: Math.round(Number(amountUsd) * 100),
        transferDate: new Date(`${transferDate}T12:00:00-05:00`).toISOString(),
        reference,
      },
    });
    setReference('');
    setDrawerOpen(false);
    setToast(
      res.possibleDuplicate
        ? 'Comprobante cargado (ADVERTENCIA: posible duplicado detectado).'
        : 'Comprobante enviado a la bandeja contable.',
    );
    await loadData();
  }

  async function handleApprove(proofId: string) {
    if (!window.confirm('¿Aprobar comprobante, registrar pago y emitir comprobante de recaudación?')) return;
    const res = await apiFetch<{ receipt: { receiptCode: string } }>(
      `/billing/payment-proofs/${proofId}/approve`,
      { method: 'POST' },
    );
    setToast(`Pago aprobado. Comprobante emitido: ${res.receipt.receiptCode}`);
    await loadData();
  }

  async function handleReject(proofId: string) {
    const reason = window.prompt('Motivo obligatorio del rechazo:');
    if (!reason || !reason.trim()) return;
    await apiFetch(`/billing/payment-proofs/${proofId}/reject`, {
      method: 'POST',
      body: { reason },
    });
    setToast('Comprobante rechazado.');
    await loadData();
  }

  async function handleGenerateFees() {
    const month = new Date().toISOString().slice(0, 7);
    if (!window.confirm(`¿Generar alícuotas mensuales para ${month} en todas las unidades activas?`)) return;
    const res = await apiFetch<{ created: number }>('/billing/monthly-fees/generate', {
      method: 'POST',
      body: { billingMonth: month, dueDate: new Date(`${month}-10T23:59:59-05:00`).toISOString() },
    });
    setToast(`Alícuotas ${month}: ${res.created} cargos generados.`);
  }

  const unitLabel = (id: string) => {
    const found = units.find((u) => u.id === id);
    return found ? `Depto. ${found.number}` : id.slice(0, 8);
  };

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Finanzas y bandeja contable</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Revisión de comprobantes, emisión secuencial de recibos y generación de alícuotas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleGenerateFees}
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
            Generar alícuotas del mes
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            + Cargar comprobante
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-success)', color: 'var(--color-success)', fontSize: '13px' }}>
          {toast}
        </div>
      )}

      {!isAccountant ? (
        <p style={{ color: 'var(--color-text-muted)' }}>
          La cola de aprobación de comprobantes es visible exclusivamente para el Contador y SuperAdmin.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px' }}>
          <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {proofs.length === 0 ? (
              <p style={{ padding: '20px', color: 'var(--color-text-muted)' }}>No hay comprobantes registrados.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '10px' }}>Unidad</th>
                    <th style={{ padding: '10px' }}>Banco / Ref.</th>
                    <th style={{ padding: '10px' }}>Monto</th>
                    <th style={{ padding: '10px' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {proofs.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        cursor: 'pointer',
                        backgroundColor: selected?.id === p.id ? 'var(--color-bg)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '10px', fontWeight: 600 }}>{unitLabel(p.unitId)}</td>
                      <td style={{ padding: '10px' }}>
                        <div>{p.bank}</div>
                        <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{p.reference}</div>
                      </td>
                      <td style={{ padding: '10px' }}><Money cents={p.amountCents} /></td>
                      <td style={{ padding: '10px' }}><StatusBadge status={p.status === 'PENDING' ? 'IN_REVIEW' : p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
            {selected ? (
              <>
                <h2 style={{ margin: '0 0 12px', fontSize: '17px' }}>Detalle del comprobante</h2>
                <dl style={{ display: 'grid', gap: '8px', fontSize: '14px', margin: 0 }}>
                  <div><strong>Unidad:</strong> {unitLabel(selected.unitId)}</div>
                  <div><strong>Banco:</strong> {selected.bank}</div>
                  <div><strong>Referencia:</strong> <code>{selected.reference}</code></div>
                  <div><strong>Monto:</strong> <Money cents={selected.amountCents} /></div>
                  <div><strong>Fecha transferencia:</strong> {new Date(selected.transferDate).toLocaleDateString('es-EC')}</div>
                  <div><strong>Estado:</strong> <StatusBadge status={selected.status === 'PENDING' ? 'IN_REVIEW' : selected.status} /></div>
                  {selected.rejectionReason && (
                    <div style={{ color: 'var(--color-danger)' }}><strong>Motivo rechazo:</strong> {selected.rejectionReason}</div>
                  )}
                </dl>

                {selected.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button
                      type="button"
                      onClick={() => handleApprove(selected.id)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        backgroundColor: 'var(--color-success)',
                        color: '#ffffff',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Aprobar pago
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(selected.id)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-danger)',
                        backgroundColor: 'transparent',
                        color: 'var(--color-danger)',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--color-text-muted)' }}>Selecciona un comprobante para revisar.</p>
            )}
          </div>
        </div>
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
            <h2 style={{ margin: 0, fontSize: '18px' }}>Registrar comprobante</h2>
            <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>
          <form onSubmit={handleSubmitProof} style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Unidad
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                {units.map((u) => <option key={u.id} value={u.id}>Depto. {u.number}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Banco
              <input required value={bank} onChange={(e) => setBank(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Monto (USD)
              <input type="number" step="0.01" required value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Número de referencia
              <input required value={reference} onChange={(e) => setReference(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Fecha de transferencia
              <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <button type="submit" style={{ padding: '10px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
              Enviar a bandeja
            </button>
          </form>
        </aside>
      )}
    </section>
  );
}
