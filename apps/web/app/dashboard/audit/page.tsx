'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi, type StaffProfile } from '../../../lib/api/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  actorType: string;
  channel: string;
  createdAt: string;
}

export default function AuditPage() {
  const router = useRouter();
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [logs, setLogs] = useState<AuditRow[]>([]);

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
        const res = await fetch(`${API_URL}/audit/logs`, {
          headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
          credentials: 'include',
        });
        if (res.ok) setLogs((await res.json()) as AuditRow[]);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!me) return <main style={{ padding: '32px' }}>Cargando bitácora de auditoría...</main>;

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
        <h1 style={{ margin: 0, fontSize: '20px' }}>Bitácora de auditoría</h1>
        <Link href="/dashboard/config" style={{ color: 'var(--color-primary)', fontSize: '14px' }}>
          Configurador
        </Link>
      </header>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '10px 8px' }}>Fecha</th>
            <th style={{ padding: '10px 8px' }}>Acción</th>
            <th style={{ padding: '10px 8px' }}>Entidad</th>
            <th style={{ padding: '10px 8px' }}>Canal</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 8px' }}>
                {new Date(l.createdAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}
              </td>
              <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{l.action}</td>
              <td style={{ padding: '10px 8px' }}>{l.entity}</td>
              <td style={{ padding: '10px 8px' }}>{l.channel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
