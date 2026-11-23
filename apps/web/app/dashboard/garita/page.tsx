'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@noah/ui';
import { authApi, type StaffProfile } from '../../../lib/api/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

interface ParkingSpot {
  spot: number;
  occupied: boolean;
  visitorName: string | null;
  plate: string | null;
  checkInAt: string | null;
}

export default function GaritaConsolePage() {
  const router = useRouter();
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);

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
        const res = await fetch(`${API_URL}/visits/parking-status`, {
          headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
          credentials: 'include',
        });
        if (res.ok) {
          const data = (await res.json()) as { spots: ParkingSpot[] };
          setSpots(data.spots);
        }
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!me) return <main style={{ padding: '32px' }}>Cargando consola de garita...</main>;

  return (
    <main style={{ maxWidth: '1120px', margin: '24px auto', padding: '0 24px', fontSize: '16px' }}>
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
        <h1 style={{ margin: 0, fontSize: '22px' }}>Consola de garita — Parqueaderos de visitas</h1>
        <Link href="/dashboard/reservations" style={{ color: 'var(--color-primary)', fontSize: '14px' }}>
          Volver al dashboard
        </Link>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {spots.map((s) => (
          <article
            key={s.spot}
            style={{
              padding: '20px',
              minHeight: '120px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Puesto #{s.spot}</strong>
              <StatusBadge status={s.occupied ? 'PENDING_PAYMENT' : 'OK'} />
            </div>
            <p style={{ margin: '12px 0 0', fontSize: '15px', color: 'var(--color-text-muted)' }}>
              {s.occupied ? `${s.visitorName ?? 'Visita'} · ${s.plate ?? 'Sin placa'}` : 'Disponible'}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
