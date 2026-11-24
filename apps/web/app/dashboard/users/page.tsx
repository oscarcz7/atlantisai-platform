'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StatusBadge } from '@noah/ui';
import { ApiClientError, authApi, type StaffProfile } from '../../../lib/api/auth';
import { useDashboard } from '../../../lib/dashboard-context';

const ROLE_LABELS: Record<StaffProfile['role'], string> = {
  SUPERADMIN: 'SuperAdmin',
  ADMIN: 'Administrador',
  ACCOUNTANT: 'Contador',
  GUARD: 'Guardia',
};

export default function StaffUsersPage() {
  const { token, me, tenantId } = useDashboard();
  const [users, setUsers] = useState<StaffProfile[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffProfile['role']>('ADMIN');
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (me.role !== 'SUPERADMIN') return;
    const list = await authApi.listStaffUsers(token);
    setUsers(list);
  }, [me.role, token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await authApi.inviteStaffUser(token, {
        email,
        fullName,
        role,
        tenantIds: tenantId ? [tenantId] : [],
      });
      setEmail('');
      setFullName('');
      setDrawerOpen(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo invitar al usuario.');
    }
  }

  async function handleDeactivate(userId: string) {
    if (!window.confirm('¿Desactivar este usuario y cerrar todas sus sesiones activas?')) return;
    await authApi.deactivateStaffUser(token, userId);
    await loadUsers();
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Usuarios internos</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Personal autorizado con 2FA obligatorio y acceso por edificio.
          </p>
        </div>
        {me.role === 'SUPERADMIN' && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={{
              padding: '9px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Nuevo usuario
          </button>
        )}
      </div>

      {me.role !== 'SUPERADMIN' ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Solo el SuperAdmin puede gestionar usuarios internos.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px' }}>Nombre</th>
              <th style={{ padding: '12px' }}>Correo</th>
              <th style={{ padding: '12px' }}>Rol</th>
              <th style={{ padding: '12px' }}>2FA</th>
              <th style={{ padding: '12px' }}>Estado</th>
              <th style={{ padding: '12px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px', fontWeight: 500 }}>{u.fullName}</td>
                <td style={{ padding: '12px' }}>{u.email}</td>
                <td style={{ padding: '12px' }}>{ROLE_LABELS[u.role]}</td>
                <td style={{ padding: '12px' }}>
                  <StatusBadge status={u.totpEnabled ? 'CONFIRMED' : 'PENDING_PAYMENT'} />
                </td>
                <td style={{ padding: '12px' }}>
                  <StatusBadge status={u.isActive ? 'OK' : 'CANCELLED'} />
                </td>
                <td style={{ padding: '12px' }}>
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
                        fontSize: '12px',
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
            boxShadow: '-4px 0 24px rgba(0,0,0,0.14)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Invitar usuario interno</h2>
            <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>
          <form onSubmit={handleInvite} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Nombre completo
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Correo electrónico
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
              Rol
              <select value={role} onChange={(e) => setRole(e.target.value as StaffProfile['role'])} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                <option value="ADMIN">Administrador de edificio</option>
                <option value="ACCOUNTANT">Contador</option>
                <option value="GUARD">Guardia</option>
                <option value="SUPERADMIN">SuperAdmin</option>
              </select>
            </label>
            {error && <div style={{ color: 'var(--color-danger)', fontSize: '13px' }}>{error}</div>}
            <button type="submit" style={{ padding: '10px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
              Enviar invitación (72 h)
            </button>
          </form>
        </aside>
      )}
    </section>
  );
}
