'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, Copy, Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import { HabitatDrawer, HabitatToast, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { authApi, type StaffProfile } from '../../../lib/api/auth';
import { useDashboard } from '../../../lib/dashboard-context';
import { formatDayRange } from '../../../lib/labels';

interface BankAccount {
  bank: string;
  accountType: string;
  accountNumber: string;
  holder: string;
  rucOrId: string;
  purpose?: string;
}

const EMPTY_BANK: BankAccount = {
  bank: '',
  accountType: 'Corriente',
  accountNumber: '',
  holder: '',
  rucOrId: '',
  purpose: 'General',
};

interface TenantDto {
  id: string;
  code: string;
  name: string;
  ruc: string | null;
  timezone: string;
  contacts: {
    administrator?: { company?: string; contactName?: string; phone?: string; email?: string } | null;
    security?: { company?: string; whatsapp?: string } | null;
  } | null;
  officeHours: {
    inPerson?: { days?: string; open?: string; close?: string };
    phoneWhatsapp?: { days?: string; open?: string; close?: string };
    weekends?: string;
  } | null;
  bankAccounts: BankAccount[] | null;
  admins?: Array<{ id: string; fullName: string; email: string; isActive: boolean }>;
}

export default function BuildingsPage() {
  const { token, me, tenantId, setTenantId, refreshMe, apiFetch } = useDashboard();
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [adminUsers, setAdminUsers] = useState<StaffProfile[]>([]);
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<'none' | 'create' | 'edit' | 'clone'>('none');
  const [editing, setEditing] = useState<TenantDto | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [ruc, setRuc] = useState('');
  const [timezone, setTimezone] = useState('America/Guayaquil');
  const [adminCompany, setAdminCompany] = useState('');
  const [adminContact, setAdminContact] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [secCompany, setSecCompany] = useState('');
  const [secWhatsapp, setSecWhatsapp] = useState('');
  const [inPersonDays, setInPersonDays] = useState('MON-FRI');
  const [inPersonOpen, setInPersonOpen] = useState('15:00');
  const [inPersonClose, setInPersonClose] = useState('17:00');
  const [waDays, setWaDays] = useState('MON-FRI');
  const [waOpen, setWaOpen] = useState('09:00');
  const [waClose, setWaClose] = useState('17:00');
  const [weekends, setWeekends] = useState('Solo emergencias por WhatsApp');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([{ ...EMPTY_BANK }]);

  const [cloneSourceId, setCloneSourceId] = useState('');
  const [cloneCode, setCloneCode] = useState('');
  const [cloneName, setCloneName] = useState('');

  const isSuperAdmin = me.role === 'SUPERADMIN';
  const canEdit = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const load = useCallback(async () => {
    const [list, users] = await Promise.all([
      apiFetch<TenantDto[]>('/tenants'),
      isSuperAdmin ? authApi.listStaffUsers(token).catch(() => []) : Promise.resolve([]),
    ]);
    setTenants(list);
    setAdminUsers(users.filter((u) => u.role === 'ADMIN'));
  }, [apiFetch, isSuperAdmin, token]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setCode('');
    setName('');
    setRuc('');
    setTimezone('America/Guayaquil');
    setAdminCompany('');
    setAdminContact('');
    setAdminPhone('');
    setAdminEmail('');
    setSecCompany('');
    setSecWhatsapp('');
    setInPersonDays('MON-FRI');
    setInPersonOpen('15:00');
    setInPersonClose('17:00');
    setWaDays('MON-FRI');
    setWaOpen('09:00');
    setWaClose('17:00');
    setWeekends('Solo emergencias por WhatsApp');
    setBankAccounts([{ ...EMPTY_BANK }]);
    setSelectedAdminIds([]);
    setDrawer('create');
  }

  function openEdit(t: TenantDto) {
    setEditing(t);
    setCode(t.code);
    setName(t.name);
    setRuc(t.ruc ?? '');
    setTimezone(t.timezone || 'America/Guayaquil');
    setAdminCompany(t.contacts?.administrator?.company ?? '');
    setAdminContact(t.contacts?.administrator?.contactName ?? '');
    setAdminPhone(t.contacts?.administrator?.phone ?? '');
    setAdminEmail(t.contacts?.administrator?.email ?? '');
    setSecCompany(t.contacts?.security?.company ?? '');
    setSecWhatsapp(t.contacts?.security?.whatsapp ?? '');
    setInPersonDays(t.officeHours?.inPerson?.days ?? 'MON-FRI');
    setInPersonOpen(t.officeHours?.inPerson?.open ?? '15:00');
    setInPersonClose(t.officeHours?.inPerson?.close ?? '17:00');
    setWaDays(t.officeHours?.phoneWhatsapp?.days ?? 'MON-FRI');
    setWaOpen(t.officeHours?.phoneWhatsapp?.open ?? '09:00');
    setWaClose(t.officeHours?.phoneWhatsapp?.close ?? '17:00');
    setWeekends(t.officeHours?.weekends ?? 'Solo emergencias por WhatsApp');
    setBankAccounts(
      t.bankAccounts && t.bankAccounts.length > 0
        ? t.bankAccounts.map((b) => ({
            bank: b.bank ?? '',
            accountType: b.accountType ?? 'Corriente',
            accountNumber: b.accountNumber ?? '',
            holder: b.holder ?? '',
            rucOrId: b.rucOrId ?? '',
            purpose: b.purpose ?? 'General',
          }))
        : [{ ...EMPTY_BANK }],
    );
    setSelectedAdminIds(t.admins?.map((a) => a.id) ?? []);
    setDrawer('edit');
  }

  function toggleAdminUser(admin: StaffProfile) {
    const already = selectedAdminIds.includes(admin.id);
    setSelectedAdminIds((prev) =>
      already ? prev.filter((id) => id !== admin.id) : [...prev, admin.id],
    );
    // Auto-fill public contact fields if empty when selecting an admin
    if (!already) {
      if (!adminContact.trim()) setAdminContact(admin.fullName);
      if (!adminEmail.trim()) setAdminEmail(admin.email);
    }
  }

  function updateBankAccount(index: number, patch: Partial<BankAccount>) {
    setBankAccounts((prev) => prev.map((acc, i) => (i === index ? { ...acc, ...patch } : acc)));
  }

  function addBankAccount() {
    setBankAccounts((prev) => [...prev, { ...EMPTY_BANK }]);
  }

  function removeBankAccount(index: number) {
    setBankAccounts((prev) => prev.filter((_, i) => i !== index));
  }

  function openClone(sourceId: string) {
    setCloneSourceId(sourceId);
    setCloneCode('');
    setCloneName('');
    setDrawer('clone');
  }

  async function handleSaveBuilding(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const payload = {
      ...(drawer === 'create' ? { code: code.trim().toLowerCase() } : {}),
      name: name.trim(),
      ruc: ruc.trim() || undefined,
      timezone,
      contacts: {
        administrator: {
          company: adminCompany.trim(),
          contactName: adminContact.trim(),
          phone: adminPhone.trim(),
          email: adminEmail.trim(),
        },
        security: {
          company: secCompany.trim(),
          whatsapp: secWhatsapp.trim(),
        },
      },
      officeHours: {
        inPerson: { days: inPersonDays, open: inPersonOpen, close: inPersonClose },
        phoneWhatsapp: { days: waDays, open: waOpen, close: waClose },
        weekends,
      },
      bankAccounts: bankAccounts
        .filter((b) => b.bank.trim() !== '' || b.accountNumber.trim() !== '')
        .map((b) => ({
          bank: b.bank.trim(),
          accountType: b.accountType,
          accountNumber: b.accountNumber.trim(),
          holder: b.holder.trim(),
          rucOrId: b.rucOrId.trim(),
          purpose: b.purpose ?? 'General',
        })),
      ...(isSuperAdmin ? { adminUserIds: selectedAdminIds } : {}),
    };

    try {
      if (drawer === 'create') {
        const created = await apiFetch<TenantDto>('/tenants', { method: 'POST', body: payload });
        await refreshMe();
        setTenantId(created.id);
        setFeedback({ type: 'ok', text: `Edificio "${created.name}" creado y seleccionado como activo.` });
      } else if (editing) {
        await apiFetch<TenantDto>(`/tenants/${editing.id}`, { method: 'PATCH', body: payload });
        await refreshMe();
        setFeedback({ type: 'ok', text: `Datos de "${name}" actualizados.` });
      }
      setDrawer('none');
      await load();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar edificio.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleClone(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const created = await apiFetch<TenantDto>(`/tenants/${cloneSourceId}/clone`, {
        method: 'POST',
        body: { code: cloneCode.trim().toLowerCase(), name: cloneName.trim() },
      });
      await refreshMe();
      setTenantId(created.id);
      setDrawer('none');
      setFeedback({
        type: 'ok',
        text: `Edificio "${created.name}" clonado con toda la configuración (áreas, combos, tipologías y reglas).`,
      });
      await load();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al clonar edificio.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBuilding(t: TenantDto) {
    if (!window.confirm(`¿Eliminar el edificio "${t.name}" y toda su configuración? Esta acción no se puede deshacer.`)) {
      return;
    }
    setFeedback(null);
    try {
      await apiFetch(`/tenants/${t.id}`, { method: 'DELETE' });
      await refreshMe();
      setFeedback({ type: 'ok', text: `Edificio "${t.name}" eliminado.` });
      await load();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'No se pudo eliminar el edificio.' });
    }
  }

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="CARTERA MULTI-EDIFICIO"
        title="Edificios"
        description="Administra edificios, datos de administración, seguridad, horarios de atención y cuentas bancarias."
        icon={Building2}
        actions={
          isSuperAdmin && (
            <>
              {tenants.length > 0 && (
                <button
                  type="button"
                  className="h-btn-outline"
                  onClick={() => openClone(tenantId || tenants[0]!.id)}
                >
                  <Copy size={14} /> Clonar edificio
                </button>
              )}
              <button type="button" className="h-btn-dark" onClick={openCreate}>
                <Plus size={15} /> Nuevo edificio
              </button>
            </>
          )
        }
      />

      {feedback && (
        <HabitatToast type={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} />
      )}

      <div className="h-kpi-strip">
        <article className="h-kpi-card">
          <span>Edificios registrados</span>
          <strong>{String(tenants.length).padStart(2, '0')}</strong>
          <small>en la plataforma</small>
        </article>
        <article className="h-kpi-card">
          <span>Edificio activo</span>
          <strong style={{ fontSize: '19px' }}>
            {tenants.find((t) => t.id === tenantId)?.name ?? '—'}
          </strong>
          <small>contexto multi-tenant actual</small>
        </article>
      </div>

      <div style={{ display: 'grid', gap: '14px' }}>
        {tenants.map((t) => {
          const active = t.id === tenantId;
          return (
            <div
              key={t.id}
              className="h-panel"
              style={active ? { borderColor: 'var(--primary)', boxShadow: '0 4px 14px rgba(238, 88, 53, 0.08)' } : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', letterSpacing: '-0.3px' }}>{t.name}</h2>
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>
                      {t.code}
                    </span>
                    {active && (
                      <span className="building-score">Edificio activo</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                    RUC: {t.ruc || 'Sin registrar'} · Zona horaria: {t.timezone}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {!active && (
                    <button type="button" className="h-btn-outline h-btn-sm" onClick={() => setTenantId(t.id)}>
                      Seleccionar
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" className="h-btn-outline h-btn-sm" onClick={() => openEdit(t)}>
                      <Pencil size={13} /> Editar datos
                    </button>
                  )}
                  {isSuperAdmin && (
                    <>
                      <button type="button" className="h-btn-outline h-btn-sm" onClick={() => openClone(t.id)}>
                        <Copy size={13} /> Clonar
                      </button>
                      <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleDeleteBuilding(t)}>
                        <Trash2 size={13} /> Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '14px',
                  marginTop: '14px',
                  paddingTop: '14px',
                  borderTop: '1px solid var(--border)',
                  fontSize: '13px',
                }}
              >
                <div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '11px', marginBottom: '2px' }}>
                    Administradores del sistema
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {t.admins && t.admins.length > 0
                      ? t.admins.map((a) => a.fullName).join(', ')
                      : 'Sin asignar'}
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    {t.contacts?.administrator?.company
                      ? `Empresa: ${t.contacts.administrator.company}`
                      : t.contacts?.administrator?.email || ''}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '11px', marginBottom: '2px' }}>Seguridad / Garita</div>
                  <div style={{ fontWeight: 600 }}>{t.contacts?.security?.company || '—'}</div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>{t.contacts?.security?.whatsapp || ''}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '11px', marginBottom: '2px' }}>Horarios de oficina</div>
                  <div>
                    Presencial: {formatDayRange(t.officeHours?.inPerson?.days)} {t.officeHours?.inPerson?.open ?? ''}–{t.officeHours?.inPerson?.close ?? ''}
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    WhatsApp: {t.officeHours?.phoneWhatsapp?.open ?? ''}–{t.officeHours?.phoneWhatsapp?.close ?? ''}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '11px', marginBottom: '2px' }}>
                    Cuentas bancarias ({t.bankAccounts?.length ?? 0})
                  </div>
                  {t.bankAccounts && t.bankAccounts.length > 0 ? (
                    <div style={{ display: 'grid', gap: '4px' }}>
                      {t.bankAccounts.map((acc, idx) => (
                        <div key={idx}>
                          <div style={{ fontWeight: 600 }}>
                            {acc.bank} ({acc.accountType})
                            {acc.purpose ? ` · ${acc.purpose}` : ''}
                          </div>
                          <div style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                            {acc.accountNumber}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--muted-foreground)' }}>Sin configurar</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <HabitatDrawer
        open={drawer === 'create' || drawer === 'edit'}
        title={drawer === 'create' ? 'Nuevo edificio' : `Editar ${editing?.name ?? ''}`}
        subtitle="Configura identificación, contactos de administración/seguridad, horarios y cuenta bancaria."
        onClose={() => setDrawer('none')}
        width={540}
      >
        <form onSubmit={handleSaveBuilding} style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label className="h-field">
              Código único
              <input required disabled={drawer === 'edit'} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ej. edificio-central" className="h-input" />
            </label>
            <label className="h-field">
              Nombre del edificio
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Edificio Residencial" className="h-input" />
            </label>
            <label className="h-field">
              RUC
              <input value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="0000000000001" className="h-input" />
            </label>
            <label className="h-field">
              Zona horaria
              <input required value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-input" />
            </label>
          </div>

          {isSuperAdmin && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'grid', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserCheck size={14} /> Administradores con acceso al sistema
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground)' }}>
                Selecciona qué usuario(s) con rol Administrador operan este edificio. Si el contacto público está vacío, se autocompleta con sus datos.
              </p>
              <div
                style={{
                  display: 'grid',
                  gap: '6px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                }}
              >
                {adminUsers.length === 0 ? (
                  <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                    No hay usuarios Administrador creados aún (puedes crearlos en Administradores).
                  </span>
                ) : (
                  adminUsers.map((u) => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={selectedAdminIds.includes(u.id)}
                        onChange={() => toggleAdminUser(u)}
                      />
                      <span>
                        <strong>{u.fullName}</strong>{' '}
                        <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>({u.email})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <h3 style={{ margin: '6px 0 0', fontSize: '13px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            Contacto público para residentes (WhatsApp y recibos)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label className="h-field">
              Empresa administradora
              <input value={adminCompany} onChange={(e) => setAdminCompany(e.target.value)} placeholder="Administradora S.A." className="h-input" />
            </label>
            <label className="h-field">
              Contacto administrador
              <input value={adminContact} onChange={(e) => setAdminContact(e.target.value)} placeholder="Nombre del responsable" className="h-input" />
            </label>
            <label className="h-field">
              Teléfono administración
              <input value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="+593999000000" className="h-input" />
            </label>
            <label className="h-field">
              Correo administración
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="administracion@ejemplo.com" className="h-input" />
            </label>
            <label className="h-field">
              Empresa de seguridad
              <input value={secCompany} onChange={(e) => setSecCompany(e.target.value)} placeholder="Empresa de seguridad" className="h-input" />
            </label>
            <label className="h-field">
              WhatsApp garita / seguridad
              <input value={secWhatsapp} onChange={(e) => setSecWhatsapp(e.target.value)} placeholder="+593999000001" className="h-input" />
            </label>
          </div>

          <h3 style={{ margin: '6px 0 0', fontSize: '13px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            Horarios de atención
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <label className="h-field">
              Presencial días
              <input value={inPersonDays} onChange={(e) => setInPersonDays(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Abre
              <input type="time" value={inPersonOpen} onChange={(e) => setInPersonOpen(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Cierra
              <input type="time" value={inPersonClose} onChange={(e) => setInPersonClose(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              WhatsApp días
              <input value={waDays} onChange={(e) => setWaDays(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Abre
              <input type="time" value={waOpen} onChange={(e) => setWaOpen(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Cierra
              <input type="time" value={waClose} onChange={(e) => setWaClose(e.target.value)} className="h-input" />
            </label>
          </div>
          <label className="h-field">
            Fines de semana
            <input value={weekends} onChange={(e) => setWeekends(e.target.value)} className="h-input" />
          </label>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              margin: '6px 0 0',
              borderTop: '1px solid var(--border)',
              paddingTop: '12px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '13px' }}>
              Cuentas bancarias para transferencias ({bankAccounts.length})
            </h3>
            <button type="button" className="h-btn-outline h-btn-sm" onClick={addBankAccount}>
              <Plus size={12} /> Agregar cuenta
            </button>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {bankAccounts.map((acc, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                    Cuenta #{index + 1}
                  </strong>
                  {bankAccounts.length > 1 && (
                    <button
                      type="button"
                      className="h-btn-danger h-btn-sm"
                      onClick={() => removeBankAccount(index)}
                    >
                      <Trash2 size={11} /> Quitar
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label className="h-field">
                    Banco
                    <input
                      value={acc.bank}
                      onChange={(e) => updateBankAccount(index, { bank: e.target.value })}
                      placeholder="Nombre del banco"
                      className="h-input"
                    />
                  </label>
                  <label className="h-field">
                    Tipo de cuenta
                    <SearchableSelect
                      value={acc.accountType}
                      onChange={(val) => updateBankAccount(index, { accountType: val })}
                      searchPlaceholder="Buscar tipo..."
                      options={[
                        { value: 'Corriente', label: 'Corriente' },
                        { value: 'Ahorros', label: 'Ahorros' },
                      ]}
                    />
                  </label>
                  <label className="h-field">
                    Número de cuenta
                    <input
                      value={acc.accountNumber}
                      onChange={(e) => updateBankAccount(index, { accountNumber: e.target.value })}
                      placeholder="0000000000"
                      className="h-input"
                    />
                  </label>
                  <label className="h-field">
                    Concepto / uso
                    <SearchableSelect
                      value={acc.purpose ?? 'General'}
                      onChange={(val) => updateBankAccount(index, { purpose: val })}
                      searchPlaceholder="Buscar concepto..."
                      options={[
                        { value: 'General', label: 'General (todos los pagos)' },
                        { value: 'Alícuotas', label: 'Alícuotas mensuales' },
                        { value: 'Garantías', label: 'Fondo de garantías' },
                        { value: 'Áreas comunales', label: 'Limpieza / áreas comunales' },
                      ]}
                    />
                  </label>
                  <label className="h-field">
                    Titular / Condominio
                    <input
                      value={acc.holder}
                      onChange={(e) => updateBankAccount(index, { holder: e.target.value })}
                      placeholder="Nombre del titular"
                      className="h-input"
                    />
                  </label>
                  <label className="h-field">
                    RUC / Cédula del titular
                    <input
                      value={acc.rucOrId}
                      onChange={(e) => updateBankAccount(index, { rucOrId: e.target.value })}
                      placeholder="0000000000001"
                      className="h-input"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawer('none')}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="h-btn-dark">
              {busy ? 'Guardando...' : 'Guardar edificio'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <HabitatDrawer
        open={drawer === 'clone'}
        title="Clonar configuración de edificio"
        subtitle="Copia áreas comunales, matriz de acceso, combos, tipologías, parámetros y parqueaderos."
        onClose={() => setDrawer('none')}
        width={450}
      >
        <form onSubmit={handleClone} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Edificio origen
            <SearchableSelect
              value={cloneSourceId}
              onChange={setCloneSourceId}
              searchPlaceholder="Buscar edificio..."
              options={tenants.map((t) => ({
                value: t.id,
                label: `${t.name} (${t.code})`,
                keywords: t.code,
              }))}
            />
          </label>
          <label className="h-field">
            Código del nuevo edificio
            <input required value={cloneCode} onChange={(e) => setCloneCode(e.target.value)} placeholder="ej. edificio-copia" className="h-input" />
          </label>
          <label className="h-field">
            Nombre del nuevo edificio
            <input required value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="Nuevo Edificio" className="h-input" />
          </label>
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawer('none')}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="h-btn-dark">
              {busy ? 'Clonando...' : 'Clonar edificio'}
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
