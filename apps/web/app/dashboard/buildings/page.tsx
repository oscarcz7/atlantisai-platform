'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useDashboard } from '../../../lib/dashboard-context';

interface BankAccount {
  bank: string;
  accountType: string;
  accountNumber: string;
  holder: string;
  rucOrId: string;
}

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
}

const inputStyle = {
  padding: '9px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: '14px',
  width: '100%',
} as const;

const primaryBtn = {
  padding: '9px 14px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  backgroundColor: 'var(--color-primary)',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '13px',
} as const;

const secondaryBtn = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontWeight: 500,
  cursor: 'pointer',
  fontSize: '13px',
} as const;

export default function BuildingsPage() {
  const { me, tenantId, setTenantId, refreshMe, apiFetch } = useDashboard();
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [drawer, setDrawer] = useState<'none' | 'create' | 'edit' | 'clone'>('none');
  const [editing, setEditing] = useState<TenantDto | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Create / Edit form fields
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
  const [bankName, setBankName] = useState('');
  const [bankType, setBankType] = useState('Corriente');
  const [bankNumber, setBankNumber] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [bankRuc, setBankRuc] = useState('');

  // Clone fields
  const [cloneSourceId, setCloneSourceId] = useState('');
  const [cloneCode, setCloneCode] = useState('');
  const [cloneName, setCloneName] = useState('');

  const isSuperAdmin = me.role === 'SUPERADMIN';
  const canEdit = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const load = useCallback(async () => {
    const list = await apiFetch<TenantDto[]>('/tenants');
    setTenants(list);
  }, [apiFetch]);

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
    setBankName('');
    setBankType('Corriente');
    setBankNumber('');
    setBankHolder('');
    setBankRuc('');
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
    const firstBank = t.bankAccounts?.[0];
    setBankName(firstBank?.bank ?? '');
    setBankType(firstBank?.accountType ?? 'Corriente');
    setBankNumber(firstBank?.accountNumber ?? '');
    setBankHolder(firstBank?.holder ?? '');
    setBankRuc(firstBank?.rucOrId ?? '');
    setDrawer('edit');
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
      bankAccounts: bankName.trim()
        ? [
            {
              bank: bankName.trim(),
              accountType: bankType,
              accountNumber: bankNumber.trim(),
              holder: bankHolder.trim(),
              rucOrId: bankRuc.trim(),
            },
          ]
        : [],
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

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Edificios</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Administra los edificios, datos de administración, seguridad, horarios de atención y cuentas bancarias.
          </p>
        </div>
        {isSuperAdmin && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {tenants.length > 0 && (
              <button type="button" style={secondaryBtn} onClick={() => openClone(tenantId || tenants[0]!.id)}>
                Clonar desde edificio existente
              </button>
            )}
            <button type="button" style={primaryBtn} onClick={openCreate}>
              + Nuevo edificio
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid var(--color-${feedback.type === 'ok' ? 'success' : 'danger'})`,
            color: `var(--color-${feedback.type === 'ok' ? 'success' : 'danger'})`,
            fontSize: '13px',
          }}
        >
          {feedback.text}
        </div>
      )}

      <div style={{ display: 'grid', gap: '14px' }}>
        {tenants.map((t) => {
          const active = t.id === tenantId;
          return (
            <div
              key={t.id}
              style={{
                backgroundColor: 'var(--color-surface)',
                border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '18px 20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '17px' }}>{t.name}</h2>
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                      {t.code}
                    </span>
                    {active && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: 'var(--color-primary)',
                          color: '#fff',
                        }}
                      >
                        Activo
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    RUC: {t.ruc || 'Sin registrar'} · Zona horaria: {t.timezone}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!active && (
                    <button type="button" style={secondaryBtn} onClick={() => setTenantId(t.id)}>
                      Seleccionar
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" style={secondaryBtn} onClick={() => openEdit(t)}>
                      Editar datos
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button type="button" style={secondaryBtn} onClick={() => openClone(t.id)}>
                      Clonar
                    </button>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px',
                  marginTop: '14px',
                  paddingTop: '14px',
                  borderTop: '1px solid var(--color-border)',
                  fontSize: '13px',
                }}
              >
                <div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>Administración</div>
                  <div style={{ fontWeight: 500 }}>
                    {t.contacts?.administrator?.company || '—'}
                    {t.contacts?.administrator?.contactName ? ` (${t.contacts.administrator.contactName})` : ''}
                  </div>
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {t.contacts?.administrator?.phone || ''} {t.contacts?.administrator?.email ? `· ${t.contacts.administrator.email}` : ''}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>Seguridad / Garita</div>
                  <div style={{ fontWeight: 500 }}>{t.contacts?.security?.company || '—'}</div>
                  <div style={{ color: 'var(--color-text-muted)' }}>{t.contacts?.security?.whatsapp || ''}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>Horarios de oficina</div>
                  <div>
                    Presencial: {t.officeHours?.inPerson?.days ?? '—'} {t.officeHours?.inPerson?.open ?? ''}–{t.officeHours?.inPerson?.close ?? ''}
                  </div>
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    WhatsApp: {t.officeHours?.phoneWhatsapp?.open ?? ''}–{t.officeHours?.phoneWhatsapp?.close ?? ''}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>Cuenta bancaria</div>
                  {t.bankAccounts && t.bankAccounts.length > 0 ? (
                    <>
                      <div style={{ fontWeight: 500 }}>
                        {t.bankAccounts[0]!.bank} ({t.bankAccounts[0]!.accountType})
                      </div>
                      <div style={{ color: 'var(--color-text-muted)' }}>{t.bankAccounts[0]!.accountNumber}</div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--color-text-muted)' }}>Sin configurar</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(drawer === 'create' || drawer === 'edit') && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleSaveBuilding}
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: 'var(--color-surface)',
              padding: '24px',
              overflowY: 'auto',
              display: 'grid',
              gap: '14px',
              alignContent: 'start',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>
                {drawer === 'create' ? 'Nuevo edificio' : `Editar ${editing?.name}`}
              </h2>
              <button type="button" style={secondaryBtn} onClick={() => setDrawer('none')}>
                Cerrar
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Código único
                <input
                  required
                  disabled={drawer === 'edit'}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ej. noah-2"
                  style={inputStyle}
                />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Nombre del edificio
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Edificio NOAH" style={inputStyle} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                RUC
                <input value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="1790000000001" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Zona horaria
                <input required value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle} />
              </label>
            </div>

            <h3 style={{ margin: '8px 0 0', fontSize: '14px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
              Administración y Seguridad
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Empresa administradora
                <input value={adminCompany} onChange={(e) => setAdminCompany(e.target.value)} placeholder="Grupo Baluarte" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Contacto administrador
                <input value={adminContact} onChange={(e) => setAdminContact(e.target.value)} placeholder="Arq. Damián Álvarez" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Teléfono administración
                <input value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="+593984555922" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Correo administración
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@edificio.com" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Empresa de seguridad
                <input value={secCompany} onChange={(e) => setSecCompany(e.target.value)} placeholder="FISSEG" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                WhatsApp garita / seguridad
                <input value={secWhatsapp} onChange={(e) => setSecWhatsapp(e.target.value)} placeholder="+593959846694" style={inputStyle} />
              </label>
            </div>

            <h3 style={{ margin: '8px 0 0', fontSize: '14px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
              Horarios de atención
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Presencial días
                <input value={inPersonDays} onChange={(e) => setInPersonDays(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Abre
                <input type="time" value={inPersonOpen} onChange={(e) => setInPersonOpen(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Cierra
                <input type="time" value={inPersonClose} onChange={(e) => setInPersonClose(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                WhatsApp días
                <input value={waDays} onChange={(e) => setWaDays(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Abre
                <input type="time" value={waOpen} onChange={(e) => setWaOpen(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Cierra
                <input type="time" value={waClose} onChange={(e) => setWaClose(e.target.value)} style={inputStyle} />
              </label>
            </div>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Fines de semana
              <input value={weekends} onChange={(e) => setWeekends(e.target.value)} style={inputStyle} />
            </label>

            <h3 style={{ margin: '8px 0 0', fontSize: '14px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
              Cuenta bancaria para transferencias
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Banco
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco Pichincha" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Tipo de cuenta
                <select value={bankType} onChange={(e) => setBankType(e.target.value)} style={inputStyle}>
                  <option value="Corriente">Corriente</option>
                  <option value="Ahorros">Ahorros</option>
                </select>
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Número de cuenta
                <input value={bankNumber} onChange={(e) => setBankNumber(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Titular / Condominio
                <input value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px', gridColumn: '1 / -1' }}>
                RUC / Cédula del titular
                <input value={bankRuc} onChange={(e) => setBankRuc(e.target.value)} style={inputStyle} />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" style={secondaryBtn} onClick={() => setDrawer('none')}>
                Cancelar
              </button>
              <button type="submit" disabled={busy} style={primaryBtn}>
                {busy ? 'Guardando...' : 'Guardar edificio'}
              </button>
            </div>
          </form>
        </div>
      )}

      {drawer === 'clone' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleClone}
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: 'var(--color-surface)',
              padding: '24px',
              display: 'grid',
              gap: '14px',
              alignContent: 'start',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Clonar configuración de edificio</h2>
              <button type="button" style={secondaryBtn} onClick={() => setDrawer('none')}>
                Cerrar
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Crea un nuevo edificio copiando todas las áreas comunales, matriz de acceso, combos, tipologías, parámetros y parqueaderos.
            </p>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Edificio origen
              <select value={cloneSourceId} onChange={(e) => setCloneSourceId(e.target.value)} style={inputStyle}>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Código del nuevo edificio
              <input required value={cloneCode} onChange={(e) => setCloneCode(e.target.value)} placeholder="torre-norte" style={inputStyle} />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Nombre del nuevo edificio
              <input required value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="Torre Norte" style={inputStyle} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" style={secondaryBtn} onClick={() => setDrawer('none')}>
                Cancelar
              </button>
              <button type="submit" disabled={busy} style={primaryBtn}>
                {busy ? 'Clonando...' : 'Clonar edificio'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
