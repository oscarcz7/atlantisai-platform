'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, FileSpreadsheet, Plus, Receipt, X } from 'lucide-react';
import { Money, StatusBadge } from '@noah/ui';
import { HabitatDrawer, HabitatToast, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { useDashboard } from '../../../lib/dashboard-context';
import {
  currentMonthInZone,
  formatDateInZone,
  formatMonthKey,
  todayInZone,
  zonedTimeToUtcIso,
} from '../../../lib/zoned-time';

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
  const { me, tenantId, tenantTimezone, apiFetch } = useDashboard();
  const [proofs, setProofs] = useState<PaymentProofRow[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selected, setSelected] = useState<PaymentProofRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feesDialogOpen, setFeesDialogOpen] = useState(false);
  const [feesMonth, setFeesMonth] = useState('');

  const [unitId, setUnitId] = useState('');
  const [bank, setBank] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [reference, setReference] = useState('');
  const [transferDate, setTransferDate] = useState(() => todayInZone(tenantTimezone));

  const isAccountant = me.role === 'SUPERADMIN' || me.role === 'ACCOUNTANT';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      const u = await apiFetch<UnitOption[]>('/cadastre/units');
      setUnits(u);
      setUnitId((prev) => prev || u[0]?.id || '');
      if (isAccountant) {
        const p = await apiFetch<PaymentProofRow[]>('/billing/payment-proofs');
        setProofs(p);
        setSelected((prev) => (prev ? p.find((x) => x.id === prev.id) ?? null : p[0] ?? null));
      }
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la información de finanzas.');
    }
  }, [apiFetch, tenantId, isAccountant]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function runAction(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmitProof(e: FormEvent) {
    e.preventDefault();
    await runAction('proof', async () => {
      const res = await apiFetch<{ possibleDuplicate: boolean }>('/billing/payment-proofs', {
        method: 'POST',
        body: {
          unitId,
          fileKey: `manual/${reference}.pdf`,
          bank,
          amountCents: Math.round(Number(amountUsd) * 100),
          transferDate: zonedTimeToUtcIso(transferDate, '12:00', tenantTimezone),
          reference,
        },
      });
      setReference('');
      setAmountUsd('');
      setDrawerOpen(false);
      setToast(
        res.possibleDuplicate
          ? 'Comprobante cargado (ADVERTENCIA: posible duplicado detectado).'
          : 'Comprobante enviado a la bandeja contable.',
      );
      await loadData();
    });
  }

  async function handleApprove(proofId: string) {
    if (!window.confirm('¿Aprobar comprobante, registrar pago y emitir comprobante de recaudación?')) return;
    await runAction('review', async () => {
      const res = await apiFetch<{ receipt: { receiptCode: string } }>(
        `/billing/payment-proofs/${proofId}/approve`,
        { method: 'POST' },
      );
      setToast(`Pago aprobado. Comprobante emitido: ${res.receipt.receiptCode}`);
      await loadData();
    });
  }

  async function handleReject(proofId: string) {
    const reason = window.prompt('Motivo obligatorio del rechazo:');
    if (!reason || !reason.trim()) return;
    await runAction('review', async () => {
      await apiFetch(`/billing/payment-proofs/${proofId}/reject`, {
        method: 'POST',
        body: { reason },
      });
      setToast('Comprobante rechazado.');
      await loadData();
    });
  }

  // Month options are only labels for the selector; the API resolves the building's current month
  // and the due date (TenantSettings.monthlyFeeDueDay) when billingMonth is omitted.
  const buildingMonth = currentMonthInZone(tenantTimezone);
  const monthOptions = [-2, -1, 1].map((delta) => {
    const [y, m] = buildingMonth.split('-').map(Number);
    const idx = (y ?? 0) * 12 + ((m ?? 1) - 1) + delta;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  });

  async function handleGenerateFees(e: FormEvent) {
    e.preventDefault();
    await runAction('fees', async () => {
      const res = await apiFetch<{ billingMonth: string; dueDate: string; created: number }>(
        '/billing/monthly-fees/generate',
        { method: 'POST', body: feesMonth ? { billingMonth: feesMonth } : {} },
      );
      setFeesDialogOpen(false);
      setFeesMonth('');
      setToast(
        `Alícuotas ${formatMonthKey(res.billingMonth, 'long')}: ${res.created} cargos generados (vencen el ${formatDateInZone(res.dueDate, tenantTimezone)}).`,
      );
    });
  }

  const unitLabel = (id: string) => {
    const found = units.find((u) => u.id === id);
    return found ? `Depto. ${found.number}` : id.slice(0, 8);
  };

  const pendingProofs = proofs.filter((p) => p.status === 'PENDING').length;
  const approvedTotalCents = proofs
    .filter((p) => p.status === 'APPROVED')
    .reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="TESORERÍA Y RECAUDACIÓN"
        title="Finanzas y bandeja contable"
        description="Revisión en vista dividida de comprobantes, emisión secuencial de recibos REC y generación de alícuotas."
        icon={Receipt}
        actions={
          <>
            <button type="button" className="h-btn-outline" onClick={() => setFeesDialogOpen(true)}>
              <FileSpreadsheet size={14} /> Generar alícuotas del mes
            </button>
            <button type="button" className="h-btn-dark" onClick={() => setDrawerOpen(true)}>
              <Plus size={15} /> Cargar comprobante
            </button>
          </>
        }
      />

      {toast && <HabitatToast type="ok" text={toast} onClose={() => setToast(null)} />}
      {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}
      {loadError && (
        <div className="h-notice h-notice-err" role="alert">
          <span>{loadError}</span>
          <button type="button" className="h-btn-outline" onClick={() => void loadData()}>
            Reintentar
          </button>
        </div>
      )}

      {isAccountant && (
        <div className="h-kpi-strip">
          <article className="h-kpi-card">
            <span>Comprobantes por revisar</span>
            <strong>{String(pendingProofs).padStart(2, '0')}</strong>
            <small>pendientes de aprobación</small>
          </article>
          <article className="h-kpi-card">
            <span>Total aprobado</span>
            <strong>
              <Money cents={approvedTotalCents} />
            </strong>
            <small>en comprobantes validados</small>
          </article>
          <article className="h-kpi-card">
            <span>Total recibidos</span>
            <strong>{proofs.length}</strong>
            <small>histórico en bandeja</small>
          </article>
        </div>
      )}

      {!isAccountant ? (
        <div className="h-panel" style={{ color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
          Por separación de funciones, la cola de aprobación de comprobantes es exclusiva para el <strong>Contador</strong> y <strong>SuperAdmin</strong>. Puedes cargar comprobantes o generar las alícuotas del mes desde los botones superiores.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', alignItems: 'start' }}>
          <div className="h-table-wrap">
            {proofs.length === 0 ? (
              <p style={{ padding: '22px', margin: 0, color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
                No hay comprobantes registrados.
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Unidad</th>
                    <th>Banco / Ref.</th>
                    <th>Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {proofs.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selected?.id === p.id ? '#f6eee5' : undefined,
                      }}
                    >
                      <td style={{ fontWeight: 600 }}>{unitLabel(p.unitId)}</td>
                      <td>
                        <div>{p.bank}</div>
                        <div style={{ fontSize: '11.5px', fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>
                          {p.reference}
                        </div>
                      </td>
                      <td>
                        <Money cents={p.amountCents} />
                      </td>
                      <td>
                        <StatusBadge status={p.status === 'PENDING' ? 'IN_REVIEW' : p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="h-panel">
            {selected ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h2 style={{ margin: 0, fontSize: '16px' }}>Detalle del comprobante</h2>
                  <StatusBadge status={selected.status === 'PENDING' ? 'IN_REVIEW' : selected.status} />
                </div>
                <dl style={{ display: 'grid', gap: '10px', fontSize: '13.5px', margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0eee9', paddingBottom: '8px' }}>
                    <dt style={{ color: 'var(--muted-foreground)' }}>Unidad</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{unitLabel(selected.unitId)}</dd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0eee9', paddingBottom: '8px' }}>
                    <dt style={{ color: 'var(--muted-foreground)' }}>Banco</dt>
                    <dd style={{ margin: 0 }}>{selected.bank}</dd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0eee9', paddingBottom: '8px' }}>
                    <dt style={{ color: 'var(--muted-foreground)' }}>Referencia</dt>
                    <dd style={{ margin: 0, fontFamily: 'monospace' }}>{selected.reference}</dd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0eee9', paddingBottom: '8px' }}>
                    <dt style={{ color: 'var(--muted-foreground)' }}>Monto</dt>
                    <dd style={{ margin: 0, fontWeight: 700, fontSize: '16px' }}>
                      <Money cents={selected.amountCents} />
                    </dd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <dt style={{ color: 'var(--muted-foreground)' }}>Fecha transferencia</dt>
                    <dd style={{ margin: 0 }}>{formatDateInZone(selected.transferDate, tenantTimezone)}</dd>
                  </div>
                  {selected.rejectionReason && (
                    <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#fae9e6', color: '#b7544d', fontSize: '12.5px' }}>
                      <strong>Motivo rechazo:</strong> {selected.rejectionReason}
                    </div>
                  )}
                </dl>

                {selected.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button type="button" className="h-btn-success" style={{ flex: 1 }} disabled={busy !== null} onClick={() => void handleApprove(selected.id)}>
                      <Check size={15} /> Aprobar pago
                    </button>
                    <button type="button" className="h-btn-danger" style={{ flex: 1 }} disabled={busy !== null} onClick={() => void handleReject(selected.id)}>
                      <X size={15} /> Rechazar
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--muted-foreground)', margin: 0, fontSize: '13.5px' }}>
                Selecciona un comprobante de la lista para revisar.
              </p>
            )}
          </div>
        </div>
      )}

      <HabitatDrawer
        open={drawerOpen}
        title="Registrar comprobante"
        subtitle="Carga manual de transferencia recibida en administración para validación contable."
        onClose={() => setDrawerOpen(false)}
        width={430}
      >
        <form onSubmit={handleSubmitProof} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Unidad
            <SearchableSelect
              value={unitId}
              onChange={setUnitId}
              searchPlaceholder="Buscar unidad..."
              options={units.map((u) => ({
                value: u.id,
                label: `Depto. ${u.number}`,
                keywords: u.number,
              }))}
            />
          </label>
          <label className="h-field">
            Banco
            <input required value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Nombre del banco" className="h-input" />
          </label>
          <label className="h-field">
            Monto (USD)
            <input type="number" step="0.01" min="0.01" required value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Número de referencia
            <input required value={reference} onChange={(e) => setReference(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Fecha de transferencia
            <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="h-input" />
          </label>
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" disabled={busy === 'proof'}>
              {busy === 'proof' ? 'Enviando…' : 'Enviar a bandeja'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <HabitatDrawer
        open={feesDialogOpen}
        title="Generar alícuotas"
        subtitle="Crea el cargo mensual de todas las unidades activas. Las unidades que ya tienen la alícuota del mes no se duplican."
        onClose={() => setFeesDialogOpen(false)}
        width={430}
      >
        <form onSubmit={handleGenerateFees} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Mes a facturar
            <select className="h-input" value={feesMonth} onChange={(e) => setFeesMonth(e.target.value)}>
              <option value="">Mes actual del edificio ({formatMonthKey(buildingMonth, 'long')})</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonthKey(m, 'long')}
                </option>
              ))}
            </select>
          </label>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted-foreground)' }}>
            La fecha de vencimiento se calcula con el día configurado en Configuración → Finanzas, en la zona horaria del edificio.
          </p>
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setFeesDialogOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" disabled={busy === 'fees'}>
              {busy === 'fees' ? 'Generando…' : 'Generar alícuotas'}
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
