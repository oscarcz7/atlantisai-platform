'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Money, StatusBadge } from '@noah/ui';
import { authApi, type StaffProfile } from '../../../lib/api/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

interface PaymentProofRow {
  id: string;
  unitId: string;
  bank: string;
  amountCents: number;
  reference: string;
  status: string;
  transferDate: string;
}

export default function BillingPage() {
  const router = useRouter();
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [proofs, setProofs] = useState<PaymentProofRow[]>([]);

  async function loadProofs(token: string, tenantId: string) {
    const res = await fetch(`${API_URL}/billing/payment-proofs`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
      credentials: 'include',
    });
    if (res.ok) setProofs((await res.json()) as PaymentProofRow[]);
  }

  useEffect(() => {
    const token = sessionStorage.getItem('noah_access_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    authApi
      .me(token)
      .then(async (profile) => {
        setMe(profile);
        const tenantId = sessionStorage.getItem('noah_tenant_id') ?? profile.tenants[0]?.id ?? '';
        if (tenantId && (profile.role === 'SUPERADMIN' || profile.role === 'ACCOUNTANT')) {
          await loadProofs(token, tenantId);
        }
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function handleApprove(proofId: string) {
    const token = sessionStorage.getItem('noah_access_token');
    const tenantId = sessionStorage.getItem('noah_tenant_id') ?? me?.tenants[0]?.id ?? '';
    if (!token || !tenantId) return;
    if (!window.confirm('¿Aprobar este comprobante y emitir el comprobante de recaudación?')) return;
    await fetch(`${API_URL}/billing/payment-proofs/${proofId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
      credentials: 'include',
    });
    await loadProofs(token, tenantId);
  }

  if (!me) return <main style={{ padding: '32px' }}>Cargando bandeja contable...</main>;

  return (
    <main style={{ maxWidth: '1080px', margin: '32px auto', padding: '0 24px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '20px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '20px' }}>Bandeja contable y finanzas</h1>
        <nav style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
          <Link href="/dashboard/reservations" style={{ color: 'var(--color-primary)' }}>
            Reservas
          </Link>
          <Link href="/dashboard/garita" style={{ color: 'var(--color-primary)' }}>
            Garita
          </Link>
          <Link href="/dashboard/incidents" style={{ color: 'var(--color-primary)' }}>
            Incidencias
          </Link>
          <Link href="/dashboard/audit" style={{ color: 'var(--color-primary)' }}>
            Auditoría
          </Link>
        </nav>
      </header>

      {proofs.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>
          No hay comprobantes de pago pendientes de revisión.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '10px 8px' }}>Banco</th>
              <th style={{ padding: '10px 8px' }}>Referencia</th>
              <th style={{ padding: '10px 8px' }}>Monto</th>
              <th style={{ padding: '10px 8px' }}>Estado</th>
              <th style={{ padding: '10px 8px' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {proofs.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 8px' }}>{p.bank}</td>
                <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{p.reference}</td>
                <td style={{ padding: '10px 8px' }}>
                  <Money cents={p.amountCents} />
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <StatusBadge status={p.status === 'PENDING' ? 'IN_REVIEW' : p.status} />
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {p.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(p.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        backgroundColor: 'var(--color-success)',
                        color: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      Aprobar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
