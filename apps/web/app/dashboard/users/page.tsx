'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, UserCog } from 'lucide-react';
import { StatusBadge } from '@noah/ui';
import { HabitatDrawer, HabitatToast, ModuleHero } from '../../../components/habitat-ui';
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
  const [toast, setToast] = useState<string | null>(null);

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
      setToast('Invitación enviada (válida por 72 horas).');
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo invitar al usuario.');
    }
  }

  async function handleDeactivate(userId: string) {
    if (!window.confirm('¿Desactivar este usuario y cerrar todas sus sesiones activas?')) return;
    await authApi.deactivateStaffUser(token, userId);
    setToast('Usuario desactivado y sesiones revocadas.');
    await loadUsers();
  }

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="EQUIPO Y PERMISOS"
        title="Usuarios internos"
        description="Gestiona el personal autorizado con 2FA obligatorio, control de acceso por rol y asignación por edificio."
        icon={UserCog}
        actions={
          me.role === 'SUPERADMIN' && (
            <button type="button" className="h-btn-dark" onClick={() => { setError(null); setDrawerOpen(true); }}>
              <Plus size={15} /> Nuevo usuario
            </button>
          )
        }
      />

      {toast && <HabitatToast type="ok" text={toast} onClose={() => setToast(null)} />}

      {me.role !== 'SUPERADMIN' ? (
        <div className="h-panel" style={{ color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
          Solo el SuperAdmin puede gestionar usuarios internos.
        </div>
      ) : (
        <div className="h-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>2FA</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>
                    <StatusBadge status={u.totpEnabled ? 'CONFIRMED' : 'PENDING_PAYMENT'} />
                  </td>
                  <td>
                    <StatusBadge status={u.isActive ? 'OK' : 'CANCELLED'} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {u.isActive && u.id !== me.id && (
                      <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleDeactivate(u.id)}>
                        Desactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HabitatDrawer
        open={drawerOpen}
        title="Invitar usuario interno"
        subtitle="Se enviará un enlace de activación válido por 72 horas con configuración obligatoria de 2FA."
        onClose={() => setDrawerOpen(false)}
        width={430}
      >
        <form onSubmit={handleInvite} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Nombre completo
            <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Correo electrónico
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Rol
            <select value={role} onChange={(e) => setRole(e.target.value as StaffProfile['role'])} className="h-input">
              <option value="ADMIN">Administrador de edificio</option>
              <option value="ACCOUNTANT">Contador</option>
              <option value="GUARD">Guardia</option>
              <option value="SUPERADMIN">SuperAdmin</option>
            </select>
          </label>
          {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark">
              Enviar invitación (72 h)
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
