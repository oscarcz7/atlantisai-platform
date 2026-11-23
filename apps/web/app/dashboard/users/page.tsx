'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@noah/ui';
import { ApiClientError, authApi, type StaffProfile } from '../../../lib/api/auth';

const ROLE_LABELS: Record<StaffProfile['role'], string> = {
  SUPERADMIN: 'SuperAdmin',
  ADMIN: 'Administrador',
  ACCOUNTANT: 'Contador',
  GUARD: 'Guardia',
};

export default function StaffUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [users, setUsers] = useState<StaffProfile[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffProfile['role']>('ADMIN');
  const [error, setError] = useState<string | null>(null);

  async function loadData(token: string) {
    const profile = await authApi.me(token);
    setMe(profile);
    const savedTenant = sessionStorage.getItem('noah_tenant_id') ?? profile.tenants[0]?.id ?? '';
    setSelectedTenantId(savedTenant);
    if (profile.role === 'SUPERADMIN') {
      const list = await authApi.listStaffUsers(token);
      setUsers(list);
    }
  }

  useEffect(() => {
    const token = sessionStorage.getItem('noah_access_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    loadData(token).catch(() => router.replace('/login'));
  }, [router]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    const token = sessionStorage.getItem('noah_access_token');
    if (!token) return;
    setError(null);
    try {
      await authApi.inviteStaffUser(token, {
        email,
        fullName,
        role,
        tenantIds: selectedTenantId ? [selectedTenantId] : [],
      });
      setEmail('');
      setFullName('');
      setDrawerOpen(false);
      await loadData(token);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo invitar al usuario.');
    }
  }

  async function handleDeactivate(userId: string) {
    const token = sessionStorage.getItem('noah_access_token');
    if (!token) return;
    if (!window.confirm('¿Desactivar este usuario y cerrar todas sus sesiones activas?')) return;
    await authApi.deactivateStaffUser(token, userId);
    await loadData(token);
  }

  async function handleLogout() {
    await authApi.logout();
    sessionStorage.removeItem('noah_access_token');
    sessionStorage.removeItem('noah_tenant_id');
    router.push('/login');
  }

  if (!me) {
    return <main style={{ padding: '32px' }}>Cargando sesión...</main>;
  }

  return (
    <main style={{ maxWidth: '1040px', margin: '32px auto', padding: '0 24px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '20px' }}>Usuarios internos</h1>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            {me.fullName} · {ROLE_LABELS[me.role]}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {me.tenants.length > 0 && (
            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Edificio:
              <select
                value={selectedTenantId}
                onChange={(e) => {
                  setSelectedTenantId(e.target.value);
                  sessionStorage.setItem('noah_tenant_id', e.target.value);
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)',
                }}
              >
                {me.tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {me.role === 'SUPERADMIN' && (
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
              }}
            >
              Nuevo usuario
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {me.role !== 'SUPERADMIN' ? (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Solo el SuperAdmin puede gestionar usuarios internos.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '10px 8px' }}>Nombre</th>
              <th style={{ padding: '10px 8px' }}>Correo</th>
              <th style={{ padding: '10px 8px' }}>Rol</th>
              <th style={{ padding: '10px 8px' }}>2FA</th>
              <th style={{ padding: '10px 8px' }}>Estado</th>
              <th style={{ padding: '10px 8px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 8px' }}>{u.fullName}</td>
                <td style={{ padding: '10px 8px' }}>{u.email}</td>
                <td style={{ padding: '10px 8px' }}>{ROLE_LABELS[u.role]}</td>
                <td style={{ padding: '10px 8px' }}>
                  <StatusBadge status={u.totpEnabled ? 'CONFIRMED' : 'PENDING_PAYMENT'} />
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <StatusBadge status={u.isActive ? 'OK' : 'CANCELLED'} />
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {u.isActive && u.id !== me.id && (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(u.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-danger)',
                        background: 'transparent',
                        color: 'var(--color-danger)',
                        cursor: 'pointer',
                      }}
                    >
                      Desactivar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Invitar usuario interno</h2>
            <button type="button" onClick={() => setDrawerOpen(false)}>
              ✕
            </button>
          </div>
          <form onSubmit={handleInvite} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Nombre completo
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{ padding: '8px', border: '1px solid var(--color-border)' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Correo electrónico
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ padding: '8px', border: '1px solid var(--color-border)' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Rol
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as StaffProfile['role'])}
                style={{ padding: '8px', border: '1px solid var(--color-border)' }}
              >
                <option value="ADMIN">Administrador de edificio</option>
                <option value="ACCOUNTANT">Contador</option>
                <option value="GUARD">Guardia</option>
                <option value="SUPERADMIN">SuperAdmin</option>
              </select>
            </label>
            {error && <div style={{ color: 'var(--color-danger)', fontSize: '13px' }}>{error}</div>}
            <button
              type="submit"
              style={{
                padding: '10px',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Enviar invitación (72 h)
            </button>
          </form>
        </aside>
      )}
    </main>
  );
}
