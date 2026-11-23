'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Money, StatusBadge } from '@noah/ui';
import { authApi, type StaffProfile } from '../../../lib/api/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

interface UnitRow {
  id: string;
  number: string;
  floor: number;
  monthlyFeeCents: number;
  isActive: boolean;
  unitType: { name: string };
}

interface PersonRow {
  id: string;
  fullName: string;
  nationalId: string;
  waPhone: string;
  email?: string | null;
  isActive: boolean;
}

export default function CadastrePage() {
  const router = useRouter();
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [tab, setTab] = useState<'units' | 'persons'>('units');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [persons, setPersons] = useState<PersonRow[]>([]);

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
        const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
        const [uRes, pRes] = await Promise.all([
          fetch(`${API_URL}/cadastre/units`, { headers, credentials: 'include' }),
          fetch(`${API_URL}/cadastre/persons`, { headers, credentials: 'include' }),
        ]);
        if (uRes.ok) setUnits((await uRes.json()) as UnitRow[]);
        if (pRes.ok) setPersons((await pRes.json()) as PersonRow[]);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!me) {
    return <main style={{ padding: '32px' }}>Cargando catastro...</main>;
  }

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
        <h1 style={{ margin: 0, fontSize: '20px' }}>Catastro y ocupaciones</h1>
        <nav style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
          <Link href="/dashboard/config" style={{ color: 'var(--color-primary)' }}>
            Configurador
          </Link>
          <Link href="/dashboard/users" style={{ color: 'var(--color-primary)' }}>
            Usuarios
          </Link>
        </nav>
      </header>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setTab('units')}
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            backgroundColor: tab === 'units' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: tab === 'units' ? '#ffffff' : 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          Unidades ({units.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('persons')}
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            backgroundColor: tab === 'persons' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: tab === 'persons' ? '#ffffff' : 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          Personas ({persons.length})
        </button>
      </div>

      {tab === 'units' ? (
        units.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            Aún no hay unidades registradas en este edificio.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '10px 8px' }}>Unidad</th>
                <th style={{ padding: '10px 8px' }}>Piso</th>
                <th style={{ padding: '10px 8px' }}>Tipología</th>
                <th style={{ padding: '10px 8px' }}>Alícuota</th>
                <th style={{ padding: '10px 8px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{u.number}</td>
                  <td style={{ padding: '10px 8px' }}>{u.floor}</td>
                  <td style={{ padding: '10px 8px' }}>{u.unitType.name}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <Money cents={u.monthlyFeeCents} />
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <StatusBadge status={u.isActive ? 'OK' : 'CANCELLED'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : persons.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay personas registradas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '10px 8px' }}>Nombre</th>
              <th style={{ padding: '10px 8px' }}>Cédula</th>
              <th style={{ padding: '10px 8px' }}>WhatsApp</th>
              <th style={{ padding: '10px 8px' }}>Correo</th>
            </tr>
          </thead>
          <tbody>
            {persons.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 8px', fontWeight: 500 }}>{p.fullName}</td>
                <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{p.nationalId}</td>
                <td style={{ padding: '10px 8px' }}>{p.waPhone}</td>
                <td style={{ padding: '10px 8px' }}>{p.email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
