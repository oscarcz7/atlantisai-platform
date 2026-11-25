'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, Copy, Pencil, Plus } from 'lucide-react';
import { HabitatDrawer, HabitatToast, ModuleHero } from '../../../components/habitat-ui';
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

export default function BuildingsPage() {
  const { me, tenantId, setTenantId, refreshMe, apiFetch } = useDashboard();
  const [tenants, setTenants] = useState<TenantDto[]>([]);
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
  const [bankName, setBankName] = useState('');
  const [bankType, setBankType] = useState('Corriente');
  const [bankNumber, setBankNumber] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [bankRuc, setBankRuc] = useState('');

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
                    <button type="button" className="h-btn-outline h-btn-sm" onClick={() => openClone(t.id)}>
                      <Copy size={13} /> Clonar
                    </button>
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
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '11px', marginBottom: '2px' }}>Administración</div>
                  <div style={{ fontWeight: 600 }}>
                    {t.contacts?.administrator?.company || '—'}
                    {t.contacts?.administrator?.contactName ? ` (${t.contacts.administrator.contactName})` : ''}
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    {t.contacts?.administrator?.phone || ''} {t.contacts?.administrator?.email ? `· ${t.contacts.administrator.email}` : ''}
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
                    Presencial: {t.officeHours?.inPerson?.days ?? '—'} {t.officeHours?.inPerson?.open ?? ''}–{t.officeHours?.inPerson?.close ?? ''}
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    WhatsApp: {t.officeHours?.phoneWhatsapp?.open ?? ''}–{t.officeHours?.phoneWhatsapp?.close ?? ''}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '11px', marginBottom: '2px' }}>Cuenta bancaria</div>
                  {t.bankAccounts && t.bankAccounts.length > 0 ? (
                    <>
                      <div style={{ fontWeight: 600 }}>
                        {t.bankAccounts[0]!.bank} ({t.bankAccounts[0]!.accountType})
                      </div>
                      <div style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>{t.bankAccounts[0]!.accountNumber}</div>
                    </>
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
              <input required disabled={drawer === 'edit'} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ej. noah-2" className="h-input" />
            </label>
            <label className="h-field">
              Nombre del edificio
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Edificio NOAH" className="h-input" />
            </label>
            <label className="h-field">
              RUC
              <input value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="1790000000001" className="h-input" />
            </label>
            <label className="h-field">
              Zona horaria
              <input required value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-input" />
            </label>
          </div>

          <h3 style={{ margin: '6px 0 0', fontSize: '13px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            Administración y Seguridad
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label className="h-field">
              Empresa administradora
              <input value={adminCompany} onChange={(e) => setAdminCompany(e.target.value)} placeholder="Grupo Baluarte" className="h-input" />
            </label>
            <label className="h-field">
              Contacto administrador
              <input value={adminContact} onChange={(e) => setAdminContact(e.target.value)} placeholder="Arq. Damián Álvarez" className="h-input" />
            </label>
            <label className="h-field">
              Teléfono administración
              <input value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="+593984555922" className="h-input" />
            </label>
            <label className="h-field">
              Correo administración
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@edificio.com" className="h-input" />
            </label>
            <label className="h-field">
              Empresa de seguridad
              <input value={secCompany} onChange={(e) => setSecCompany(e.target.value)} placeholder="FISSEG" className="h-input" />
            </label>
            <label className="h-field">
              WhatsApp garita / seguridad
              <input value={secWhatsapp} onChange={(e) => setSecWhatsapp(e.target.value)} placeholder="+593959846694" className="h-input" />
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

          <h3 style={{ margin: '6px 0 0', fontSize: '13px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            Cuenta bancaria para transferencias
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label className="h-field">
              Banco
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco Pichincha" className="h-input" />
            </label>
            <label className="h-field">
              Tipo de cuenta
              <select value={bankType} onChange={(e) => setBankType(e.target.value)} className="h-input">
                <option value="Corriente">Corriente</option>
                <option value="Ahorros">Ahorros</option>
              </select>
            </label>
            <label className="h-field">
              Número de cuenta
              <input value={bankNumber} onChange={(e) => setBankNumber(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Titular / Condominio
              <input value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} className="h-input" />
            </label>
            <label className="h-field" style={{ gridColumn: '1 / -1' }}>
              RUC / Cédula del titular
              <input value={bankRuc} onChange={(e) => setBankRuc(e.target.value)} className="h-input" />
            </label>
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
            <select value={cloneSourceId} onChange={(e) => setCloneSourceId(e.target.value)} className="h-input">
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </label>
          <label className="h-field">
            Código del nuevo edificio
            <input required value={cloneCode} onChange={(e) => setCloneCode(e.target.value)} placeholder="torre-norte" className="h-input" />
          </label>
          <label className="h-field">
            Nombre del nuevo edificio
            <input required value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="Torre Norte" className="h-input" />
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
