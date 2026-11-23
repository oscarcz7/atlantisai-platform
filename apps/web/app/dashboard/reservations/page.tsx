'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Money, StatusBadge } from '@noah/ui';
import { authApi, type StaffProfile } from '../../../lib/api/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

interface ReservationRow {
  id: string;
  startsAt: string;
  endsAt: string;
  declaredAttendees: number;
  status: string;
  totalCents: number;
  unit?: { number: string } | null;
  person?: { fullName: string } | null;
  amenities: Array<{ amenity: { name: string } }>;
}

export default function ReservationsPage() {
  const router = useRouter();
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [rows, setRows] = useState<ReservationRow[]>([]);

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
        const res = await fetch(`${API_URL}/reservations`, {
          headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
          credentials: 'include',
        });
        if (res.ok) setRows((await res.json()) as ReservationRow[]);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!me) {
    return <main style={{ padding: '32px' }}>Cargando calendario de reservas...</main>;
  }

  return (
    <main style={{ maxWidth: '1120px', margin: '32px auto', padding: '0 24px' }}>
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
        <h1 style={{ margin: 0, fontSize: '20px' }}>Reservas y calendario maestro</h1>
        <nav style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
          <Link href="/dashboard/cadastre" style={{ color: 'var(--color-primary)' }}>
            Catastro
          </Link>
          <Link href="/dashboard/config" style={{ color: 'var(--color-primary)' }}>
            Configurador
          </Link>
          <Link href="/dashboard/users" style={{ color: 'var(--color-primary)' }}>
            Usuarios
          </Link>
        </nav>
      </header>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Aún no hay reservas registradas en este edificio.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '10px 8px' }}>Área(s)</th>
              <th style={{ padding: '10px 8px' }}>Unidad / Residente</th>
              <th style={{ padding: '10px 8px' }}>Horario</th>
              <th style={{ padding: '10px 8px' }}>Asistentes</th>
              <th style={{ padding: '10px 8px' }}>Cobro</th>
              <th style={{ padding: '10px 8px' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 8px', fontWeight: 500 }}>
                  {r.amenities.map((a) => a.amenity.name).join(' + ')}
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {r.unit ? `Depto. ${r.unit.number}` : 'Bloqueo administrativo'}
                  {r.person ? ` · ${r.person.fullName}` : ''}
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {new Date(r.startsAt).toLocaleString('es-EC', {
                    timeZone: 'America/Guayaquil',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td style={{ padding: '10px 8px' }}>{r.declaredAttendees}</td>
                <td style={{ padding: '10px 8px' }}>
                  <Money cents={r.totalCents} />
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
