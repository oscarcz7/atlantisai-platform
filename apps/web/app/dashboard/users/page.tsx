'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, UserCog } from 'lucide-react';
import { StatusBadge } from '@noah/ui';
import { HabitatDrawer, HabitatToast, ModuleHero } from '../../../components/habitat-ui';
import { ApiClientError, authApi, type StaffProfile, type StaffTenant } from '../../../lib/api/auth';
import { useDashboard } from '../../../lib/dashboard-context';

const ROLE_LABELS: Record<StaffProfile['role'], string> = {
  SUPERADMIN: 'SuperAdmin',
  ADMIN: 'Administrador',
  ACCOUNTANT: 'Contador',
  GUARD: 'Guardia',
};

export default function StaffUsersPage() {
  const { token, me, apiFetch } = useDashboard();
  const [users, setUsers] = useState<StaffProfile[]>([]);
  const [availableTenants, setAvailableTenants] = useState<StaffTenant[]>([]);
  const [drawer, setDrawer] = useState<'none' | 'invite' | 'edit'>('none');
  const [editing, setEditing] = useState<StaffProfile | null>(null);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffProfile['role']>(
    me.role === 'SUPERADMIN' ? 'ADMIN' : 'ACCOUNTANT',
  );
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isSuperAdmin = me.role === 'SUPERADMIN';
  const canManageUsers = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const loadData = useCallback(async () => {
    if (!canManageUsers) return;
    const [list, tenants] = await Promise.all([
      authApi.listStaffUsers(token),
      apiFetch<StaffTenant[]>('/tenants'),
    ]);
    setUsers(list);
    setAvailableTenants(tenants);
  }, [canManageUsers, token, apiFetch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openInvite() {
    setEditing(null);
    setEmail('');
    setFullName('');
    setRole(isSuperAdmin ? 'ADMIN' : 'ACCOUNTANT');
    setSelectedTenantIds(availableTenants[0] ? [availableTenants[0].id] : []);
    setError(null);
    setDrawer('invite');
  }

  function openEdit(u: StaffProfile) {
    setEditing(u);
    setEmail(u.email);
    setFullName(u.fullName);
    setRole(u.role);
    setSelectedTenantIds(u.tenants.map((t) => t.id));
    setError(null);
    setDrawer('edit');
  }

  function toggleTenant(id: string) {
    setSelectedTenantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (role !== 'SUPERADMIN' && selectedTenantIds.length === 0) {
      setError('Debes asignar al menos un edificio a este usuario.');
      return;
    }
    try {
      if (drawer === 'invite') {
        await authApi.inviteStaffUser(token, {
          email,
          fullName,
          role,
          tenantIds: role === 'SUPERADMIN' ? [] : selectedTenantIds,
        });
        setToast('Invitación enviada (válida por 72 horas).');
      } else if (editing) {
        await authApi.updateStaffUser(token, editing.id, {
          fullName,
          role,
          tenantIds: role === 'SUPERADMIN' ? [] : selectedTenantIds,
        });
        setToast(`Accesos de ${fullName} actualizados.`);
      }
      setDrawer('none');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo guardar el usuario.');
    }
  }

  async function handleDeactivate(userId: string) {
    if (!window.confirm('¿Desactivar este usuario y cerrar todas sus sesiones activas?')) return;
    await authApi.deactivateStaffUser(token, userId);
    setToast('Usuario desactivado y sesiones revocadas.');
    await loadData();
  }

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow={isSuperAdmin ? 'CONSOLA SAAS · ADMINISTRADORES' : 'GESTIÓN DE EQUIPO'}
        title={isSuperAdmin ? 'Administradores y usuarios' : 'Equipo de mis edificios'}
        description={
          isSuperAdmin
            ? 'Crea usuarios Administradores y asígnales uno o varios edificios para que gestionen su operación.'
            : 'Crea Contadores y Guardias y asígnales acceso a uno o varios de los edificios que administras.'
        }
        icon={UserCog}
        actions={
          canManageUsers && (
            <button type="button" className="h-btn-dark" onClick={openInvite}>
              <Plus size={15} /> {isSuperAdmin ? 'Nuevo administrador' : 'Nuevo miembro'}
            </button>
          )
        }
      />

      {toast && <HabitatToast type="ok" text={toast} onClose={() => setToast(null)} />}

      {!canManageUsers ? (
        <div className="h-panel" style={{ color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
          No tienes permisos para gestionar usuarios.
        </div>
      ) : (
        <div className="h-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Edificios asignados</th>
                <th>2FA</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted-foreground)' }}>
                    {isSuperAdmin
                      ? 'Aún no hay administradores registrados.'
                      : 'Aún no has invitado Contadores ni Guardias a tus edificios.'}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>{ROLE_LABELS[u.role]}</td>
                    <td style={{ fontSize: '12.5px' }}>
                      {u.role === 'SUPERADMIN'
                        ? 'Todos (SaaS)'
                        : u.tenants.length > 0
                          ? u.tenants.map((t) => t.name).join(', ')
                          : '—'}
                    </td>
                    <td>
                      <StatusBadge status={u.totpEnabled ? 'CONFIRMED' : 'PENDING_PAYMENT'} />
                    </td>
                    <td>
                      <StatusBadge status={u.isActive !== false ? 'OK' : 'CANCELLED'} />
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {u.id !== me.id && (
                        <>
                          <button
                            type="button"
                            className="h-btn-outline h-btn-sm"
                            style={{ marginRight: '6px' }}
                            onClick={() => openEdit(u)}
                          >
                            <Pencil size={12} /> Edificios
                          </button>
                          {u.isActive !== false && (
                            <button
                              type="button"
                              className="h-btn-danger h-btn-sm"
                              onClick={() => void handleDeactivate(u.id)}
                            >
                              Desactivar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <HabitatDrawer
        open={drawer !== 'none'}
        title={
          drawer === 'invite'
            ? isSuperAdmin
              ? 'Invitar administrador'
              : 'Invitar miembro de equipo'
            : `Editar accesos de ${editing?.fullName ?? ''}`
        }
        subtitle={
          isSuperAdmin
            ? 'Selecciona el rol y los edificios que este usuario administrará.'
            : 'Solo puedes crear Contadores o Guardias y asignar edificios bajo tu administración.'
        }
        onClose={() => setDrawer('none')}
        width={460}
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Nombre completo
            <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Correo electrónico
            <input
              type="email"
              required
              disabled={drawer === 'edit'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-input"
            />
          </label>
          <label className="h-field">
            Rol
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffProfile['role'])}
              className="h-input"
            >
              {isSuperAdmin ? (
                <>
                  <option value="ADMIN">Administrador de edificio(s)</option>
                  <option value="SUPERADMIN">SuperAdmin (Plataforma SaaS)</option>
                </>
              ) : (
                <>
                  <option value="ACCOUNTANT">Contador</option>
                  <option value="GUARD">Guardia de garita</option>
                </>
              )}
            </select>
          </label>

          {role !== 'SUPERADMIN' && (
            <div className="h-field">
              <span>Edificios asignados (puede tener uno o varios)</span>
              <div
                style={{
                  display: 'grid',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                }}
              >
                {availableTenants.length === 0 ? (
                  <span style={{ fontSize: '12.5px', color: 'var(--muted-foreground)' }}>
                    No hay edificios disponibles todavía.
                  </span>
                ) : (
                  availableTenants.map((t) => (
                    <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={selectedTenantIds.includes(t.id)}
                        onChange={() => toggleTenant(t.id)}
                      />
                      <span>
                        <strong>{t.name}</strong> <code style={{ fontSize: '11.5px', color: 'var(--muted-foreground)' }}>({t.code})</code>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}

          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawer('none')}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark">
              {drawer === 'invite' ? 'Enviar invitación (72 h)' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
