'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@noah/ui';
import { authApi, type StaffProfile } from '../../../lib/api/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

interface TicketRow {
  id: string;
  category: string;
  location: string;
  description: string;
  urgency: string;
  status: string;
  createdAt: string;
}

export default function IncidentsPage() {
  const router = useRouter();
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);

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
        if (!tenantId) return;
        const res = await fetch(`${API_URL}/incidents`, {
          headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
          credentials: 'include',
        });
        if (res.ok) setTickets((await res.json()) as TicketRow[]);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!me) return <main style={{ padding: '32px' }}>Cargando incidencias...</main>;

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
        <h1 style={{ margin: 0, fontSize: '20px' }}>Incidencias</h1>
        <Link href="/dashboard/audit" style={{ color: 'var(--color-primary)', fontSize: '14px' }}>
          Auditoría y reportes
        </Link>
      </header>

      {tickets.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No hay incidencias registradas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '10px 8px' }}>Categoría</th>
              <th style={{ padding: '10px 8px' }}>Ubicación</th>
              <th style={{ padding: '10px 8px' }}>Urgencia</th>
              <th style={{ padding: '10px 8px' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 8px', fontWeight: 500 }}>{t.category}</td>
                <td style={{ padding: '10px 8px' }}>{t.location}</td>
                <td style={{ padding: '10px 8px' }}>{t.urgency}</td>
                <td style={{ padding: '10px 8px' }}>
                  <StatusBadge status={t.status === 'CLOSED' ? 'COMPLETED' : 'IN_REVIEW'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
