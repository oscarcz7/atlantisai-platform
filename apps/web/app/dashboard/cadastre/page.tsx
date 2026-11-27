'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, KeyRound, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { Money, StatusBadge } from '@noah/ui';
import { DomainTag, HabitatDrawer, HabitatTabs, HabitatToast, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { useDashboard } from '../../../lib/dashboard-context';
import { downloadCsv } from '../../../lib/export-csv';
import { getOccupancyRoleMeta } from '../../../lib/labels';
import { todayInZone, zonedTimeToUtcIso } from '../../../lib/zoned-time';

interface UnitTypeRow {
  id: string;
  code: string;
  name: string;
  bedrooms: number;
}

interface UnitRow {
  id: string;
  number: string;
  floor: number;
  unitTypeId: string;
  areaSqm: number | null;
  bedrooms: number;
  monthlyFeeCents: number;
  /** Set by the API: true when the fee was entered manually. */
  monthlyFeeIsManual: boolean;
  /** Computed by the API: area × building rate (0 without area or rate). */
  autoMonthlyFeeCents: number;
  isActive: boolean;
  unitType: { name: string };
  occupancies: Array<{ id: string; role: string; person: { fullName: string } }>;
}

interface PersonRow {
  id: string;
  fullName: string;
  nationalId: string;
  waPhone: string;
  email?: string | null;
  isActive: boolean;
}

interface SettingsSnippet {
  monthlyFeePerSqmCents: number;
}

export default function CadastrePage() {
  const { me, tenantId, tenantTimezone, apiFetch } = useDashboard();
  const [tab, setTab] = useState<'units' | 'persons'>('units');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitTypeRow[]>([]);
  const [feePerSqmCents, setFeePerSqmCents] = useState(0);
  const [drawer, setDrawer] = useState<'unit' | 'person' | 'occupancy' | null>(null);
  const [editingUnit, setEditingUnit] = useState<UnitRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [uNumber, setUNumber] = useState('');
  const [uFloor, setUFloor] = useState('1');
  const [uTypeId, setUTypeId] = useState('');
  const [uBedrooms, setUBedrooms] = useState('1');
  const [uAreaSqm, setUAreaSqm] = useState('');
  const [uManualFee, setUManualFee] = useState(false);
  const [uFeeUsd, setUFeeUsd] = useState('');

  const [pName, setPName] = useState('');
  const [pNationalId, setPNationalId] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');

  const [oUnitId, setOUnitId] = useState('');
  const [oPersonId, setOPersonId] = useState('');
  const [oRole, setORole] = useState('OWNER_RESIDENT');
  const [oValidFrom, setOValidFrom] = useState(() => todayInZone(tenantTimezone));
  const [oValidTo, setOValidTo] = useState('');

  const canEdit = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [u, p, ut, settings] = await Promise.all([
        apiFetch<UnitRow[]>('/cadastre/units'),
        apiFetch<PersonRow[]>('/cadastre/persons'),
        apiFetch<UnitTypeRow[]>('/catalog/unit-types'),
        apiFetch<SettingsSnippet | null>('/catalog/settings'),
      ]);
      setUnits(u);
      setPersons(p);
      setUnitTypes(ut);
      setFeePerSqmCents(settings?.monthlyFeePerSqmCents ?? 0);
      if (!uTypeId && ut[0]) {
        setUTypeId(ut[0].id);
        setUBedrooms(String(ut[0].bedrooms ?? 1));
      }
      if (!oUnitId && u[0]) setOUnitId(u[0].id);
      if (!oPersonId && p[0]) setOPersonId(p[0].id);
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No se pudo cargar el catastro.');
    }
  }, [apiFetch, tenantId, uTypeId, oUnitId, oPersonId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // The automatic fee is computed by the API; the form only shows the stored value for unchanged areas.
  const areaUnchanged =
    editingUnit !== null &&
    (uAreaSqm.trim() === '' ? editingUnit.areaSqm === null : Number(uAreaSqm) === editingUnit.areaSqm);

  function openCreateUnit() {
    setError(null);
    setEditingUnit(null);
    setUNumber('');
    setUFloor('1');
    const firstType = unitTypes[0];
    setUTypeId(firstType?.id ?? '');
    setUBedrooms(String(firstType?.bedrooms ?? 1));
    setUAreaSqm('');
    setUManualFee(feePerSqmCents === 0);
    setUFeeUsd('');
    setDrawer('unit');
  }

  function openEditUnit(u: UnitRow) {
    setError(null);
    setEditingUnit(u);
    setUNumber(u.number);
    setUFloor(String(u.floor));
    setUTypeId(u.unitTypeId);
    setUBedrooms(String(u.bedrooms ?? 1));
    setUAreaSqm(u.areaSqm !== null && u.areaSqm !== undefined ? String(u.areaSqm) : '');
    setUManualFee(u.monthlyFeeIsManual);
    setUFeeUsd((u.monthlyFeeCents / 100).toFixed(2));
    setDrawer('unit');
  }

  function handleTypeChange(nextTypeId: string) {
    setUTypeId(nextTypeId);
    const found = unitTypes.find((ut) => ut.id === nextTypeId);
    if (found) setUBedrooms(String(found.bedrooms ?? 1));
  }

  async function handleSaveUnit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const areaSqm = uAreaSqm.trim() !== '' ? Number(uAreaSqm) : null;
    const payload = {
      number: uNumber,
      floor: Number(uFloor),
      unitTypeId: uTypeId,
      bedrooms: Number(uBedrooms),
      areaSqm,
      ...(uManualFee
        ? { monthlyFeeMode: 'MANUAL' as const, monthlyFeeCents: Math.round(Number(uFeeUsd) * 100) }
        : { monthlyFeeMode: 'AUTO' as const }),
    };
    setSaving(true);
    try {
      if (editingUnit) {
        await apiFetch(`/cadastre/units/${editingUnit.id}`, { method: 'PATCH', body: payload });
        setToast(`Unidad ${uNumber} actualizada.`);
      } else {
        await apiFetch('/cadastre/units', { method: 'POST', body: payload });
        setToast(`Unidad ${uNumber} creada correctamente.`);
      }
      setEditingUnit(null);
      setDrawer(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar unidad.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePerson(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/cadastre/persons', {
        method: 'POST',
        body: {
          fullName: pName,
          nationalId: pNationalId,
          waPhone: pPhone,
          ...(pEmail ? { email: pEmail } : {}),
        },
      });
      setPName('');
      setPNationalId('');
      setPPhone('');
      setPEmail('');
      setDrawer(null);
      setToast('Persona registrada correctamente.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar persona.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateOccupancy(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/cadastre/occupancies', {
        method: 'POST',
        body: {
          unitId: oUnitId,
          personId: oPersonId,
          role: oRole,
          validFrom: zonedTimeToUtcIso(oValidFrom, '00:00:00', tenantTimezone),
          ...(oValidTo ? { validTo: zonedTimeToUtcIso(oValidTo, '23:59:59', tenantTimezone) } : {}),
        },
      });
      setDrawer(null);
      setToast('Ocupación registrada.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar ocupación.');
    } finally {
      setSaving(false);
    }
  }

  async function runDelete(action: () => Promise<void>, fallback: string) {
    setPageError(null);
    try {
      await action();
      await loadData();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : fallback);
    }
  }

  async function handleDeleteUnit(u: UnitRow) {
    if (!window.confirm(`¿Eliminar la unidad ${u.number}? (Si tiene historial de reservas o pagos se desactivará.)`)) return;
    await runDelete(async () => {
      const res = await apiFetch<{ deleted: boolean; deactivated: boolean }>(`/cadastre/units/${u.id}`, {
        method: 'DELETE',
      });
      setToast(res.deleted ? `Unidad ${u.number} eliminada.` : `Unidad ${u.number} desactivada (conserva historial).`);
    }, 'No se pudo eliminar la unidad.');
  }

  async function handleDeletePerson(p: PersonRow) {
    if (!window.confirm(`¿Eliminar a ${p.fullName}?`)) return;
    await runDelete(async () => {
      const res = await apiFetch<{ deleted: boolean; deactivated: boolean }>(`/cadastre/persons/${p.id}`, {
        method: 'DELETE',
      });
      setToast(res.deleted ? `${p.fullName} eliminado(a).` : `${p.fullName} desactivado(a) (conserva historial).`);
    }, 'No se pudo eliminar la persona.');
  }

  async function handleDeleteOccupancy(occupancyId: string, label: string) {
    if (!window.confirm(`¿Quitar la ocupación de ${label}?`)) return;
    await runDelete(async () => {
      await apiFetch(`/cadastre/occupancies/${occupancyId}`, { method: 'DELETE' });
      setToast('Ocupación eliminada.');
    }, 'No se pudo eliminar la ocupación.');
  }

  const occupiedCount = units.filter((u) => u.occupancies.length > 0).length;

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="DIRECTORIO Y PROPIEDADES"
        title="Catastro y ocupaciones"
        description="Administra unidades con metraje y dormitorios (alícuota automática por m²), residentes cifrados y vigencias."
        icon={Users}
        actions={
          <>
            <button
              type="button"
              className="h-btn-outline"
              onClick={() =>
                downloadCsv(
                  'catastro-unidades.csv',
                  ['Unidad', 'Piso', 'Tipología', 'Dormitorios', 'Metraje m2', 'Alícuota USD', 'Estado'],
                  units.map((u) => [
                    u.number,
                    u.floor,
                    u.unitType.name,
                    u.bedrooms ?? 1,
                    u.areaSqm ?? '',
                    (u.monthlyFeeCents / 100).toFixed(2),
                    u.isActive ? 'Activa' : 'Inactiva',
                  ]),
                )
              }
            >
              <Download size={14} /> CSV
            </button>
            {canEdit && (
              <>
                <button type="button" className="h-btn-outline" onClick={() => { setError(null); setDrawer('occupancy'); }}>
                  <KeyRound size={14} /> + Ocupación
                </button>
                <button type="button" className="h-btn-outline" onClick={() => { setError(null); setDrawer('person'); }}>
                  <UserPlus size={14} /> + Persona
                </button>
                <button type="button" className="h-btn-dark" onClick={openCreateUnit}>
                  <Plus size={15} /> Nueva unidad
                </button>
              </>
            )}
          </>
        }
      />

      {toast && <HabitatToast type="ok" text={toast} onClose={() => setToast(null)} />}
      {pageError && <HabitatToast type="err" text={pageError} onClose={() => setPageError(null)} />}

      <div className="h-kpi-strip">
        <article className="h-kpi-card">
          <span>Unidades</span>
          <strong>{units.length}</strong>
          <small>{occupiedCount} con ocupantes activos</small>
        </article>
        <article className="h-kpi-card">
          <span>Personas registradas</span>
          <strong>{persons.length}</strong>
          <small>cédula cifrada + WhatsApp E.164</small>
        </article>
        <article className="h-kpi-card">
          <span>Tarifa alícuota base</span>
          <strong>
            <Money cents={feePerSqmCents} />
          </strong>
          <small>por metro cuadrado (m²)</small>
        </article>
      </div>

      <HabitatTabs
        active={tab}
        onChange={setTab}
        items={[
          { key: 'units', label: `Unidades (${units.length})` },
          { key: 'persons', label: `Personas (${persons.length})` },
        ]}
      />

      {tab === 'units' ? (
        units.length === 0 ? (
          <div className="h-panel" style={{ color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
            Aún no hay unidades registradas. Crea la primera con «Nueva unidad».
          </div>
        ) : (
          <div className="h-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Piso</th>
                  <th>Tipología</th>
                  <th>Dorm.</th>
                  <th>Metraje</th>
                  <th>Alícuota</th>
                  <th>Ocupantes</th>
                  <th>Estado</th>
                  {canEdit && <th style={{ textAlign: 'right' }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.number}</td>
                    <td>{u.floor}</td>
                    <td>{u.unitType.name}</td>
                    <td>{u.bedrooms ?? 1}</td>
                    <td>{u.areaSqm ? `${u.areaSqm} m²` : '—'}</td>
                    <td>
                      <Money cents={u.monthlyFeeCents} />
                      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                        {u.monthlyFeeIsManual ? 'Manual' : 'Automática'}
                      </div>
                    </td>
                    <td style={{ fontSize: '12.5px' }}>
                      {u.occupancies.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {u.occupancies.map((o) => {
                            const roleMeta = getOccupancyRoleMeta(o.role);
                            return (
                              <span
                                key={o.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '3px 8px 3px 10px',
                                  borderRadius: '999px',
                                  background: 'var(--muted)',
                                  border: '1px solid var(--border)',
                                  fontSize: '12px',
                                }}
                              >
                                <span style={{ fontWeight: 500 }}>{o.person.fullName}</span>
                                <DomainTag
                                  compact
                                  label={roleMeta.label}
                                  bg={roleMeta.bg}
                                  color={roleMeta.color}
                                  border={roleMeta.border}
                                />
                                {canEdit && (
                                  <button
                                    type="button"
                                    title="Quitar ocupación"
                                    aria-label={`Quitar ocupación de ${o.person.fullName}`}
                                    onClick={() => void handleDeleteOccupancy(o.id, o.person.fullName)}
                                    style={{
                                      border: 0,
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      color: '#b7544d',
                                      padding: '0 2px',
                                      fontWeight: 700,
                                      lineHeight: 1,
                                    }}
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <StatusBadge status={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    {canEdit && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" className="h-btn-outline h-btn-sm" style={{ marginRight: '6px' }} onClick={() => openEditUnit(u)}>
                          <Pencil size={12} /> Editar
                        </button>
                        <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleDeleteUnit(u)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : persons.length === 0 ? (
        <div className="h-panel" style={{ color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
          Aún no hay personas registradas.
        </div>
      ) : (
        <div className="h-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cédula (enmascarada)</th>
                <th>WhatsApp</th>
                <th>Correo</th>
                {canEdit && <th style={{ textAlign: 'right' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {persons.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.fullName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{p.nationalId}</td>
                  <td>{p.waPhone}</td>
                  <td>{p.email ?? '—'}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleDeletePerson(p)}>
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HabitatDrawer
        open={drawer === 'unit'}
        title={editingUnit ? `Editar unidad ${editingUnit.number}` : 'Nueva unidad'}
        subtitle="La alícuota se calcula automáticamente multiplicando el metraje por la tarifa/m² del edificio."
        onClose={() => setDrawer(null)}
        width={470}
      >
        {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}
        <form onSubmit={handleSaveUnit} style={{ display: 'grid', gap: '14px', marginTop: error ? '12px' : 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label className="h-field">
              Número de unidad (ej. 101)
              <input required value={uNumber} onChange={(e) => setUNumber(e.target.value)} placeholder="101" className="h-input" />
            </label>
            <label className="h-field">
              Piso
              <input type="number" required value={uFloor} onChange={(e) => setUFloor(e.target.value)} className="h-input" />
            </label>
          </div>
          <label className="h-field">
            Tipología
            <SearchableSelect
              value={uTypeId}
              onChange={(val) => handleTypeChange(val)}
              searchPlaceholder="Buscar tipología..."
              options={unitTypes.map((ut) => ({
                value: ut.id,
                label: ut.name,
                keywords: ut.code,
              }))}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label className="h-field">
              Dormitorios
              <input type="number" min="0" required value={uBedrooms} onChange={(e) => setUBedrooms(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Metraje (m²)
              <input type="number" step="0.01" min="0" placeholder="ej. 75.00" value={uAreaSqm} onChange={(e) => setUAreaSqm(e.target.value)} className="h-input" />
            </label>
          </div>

          <div
            style={{
              padding: '14px',
              borderRadius: '14px',
              background: '#f6eee5',
              border: '1px solid var(--border)',
              fontSize: '13px',
            }}
          >
            <div style={{ color: 'var(--muted-foreground)', marginBottom: '4px', fontSize: '12px' }}>
              Alícuota automática: metraje × tarifa del edificio (<Money cents={feePerSqmCents} /> / m²)
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>
              {editingUnit && areaUnchanged ? (
                <>
                  <Money cents={editingUnit.autoMonthlyFeeCents} /> / mes
                </>
              ) : (
                <span style={{ fontSize: '12.5px', fontWeight: 400, color: 'var(--muted-foreground)' }}>
                  El sistema calcula la alícuota al guardar según el metraje ingresado.
                </span>
              )}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input type="checkbox" checked={uManualFee} onChange={(e) => setUManualFee(e.target.checked)} />
            Definir alícuota manualmente
          </label>

          {uManualFee && (
            <label className="h-field">
              Alícuota mensual manual (USD)
              <input type="number" step="0.01" min="0" required value={uFeeUsd} onChange={(e) => setUFeeUsd(e.target.value)} className="h-input" />
            </label>
          )}

          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" disabled={saving}>
              {saving ? 'Guardando…' : editingUnit ? 'Guardar cambios' : 'Guardar unidad'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <HabitatDrawer
        open={drawer === 'person'}
        title="Nueva persona"
        subtitle="La cédula/pasaporte se cifra con AES-256-GCM y el teléfono se normaliza a E.164."
        onClose={() => setDrawer(null)}
        width={440}
      >
        {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}
        <form onSubmit={handleCreatePerson} style={{ display: 'grid', gap: '14px', marginTop: error ? '12px' : 0 }}>
          <label className="h-field">
            Nombre completo
            <input required value={pName} onChange={(e) => setPName(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Cédula o pasaporte
            <input required value={pNationalId} onChange={(e) => setPNationalId(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Teléfono WhatsApp (ej. 0999000000)
            <input required value={pPhone} onChange={(e) => setPPhone(e.target.value)} placeholder="0999000000" className="h-input" />
          </label>
          <label className="h-field">
            Correo electrónico (opcional)
            <input type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} className="h-input" />
          </label>
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar persona'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <HabitatDrawer
        open={drawer === 'occupancy'}
        title="Vincular ocupación"
        subtitle="Asocia una persona a una unidad con su rol y ventana de vigencia."
        onClose={() => setDrawer(null)}
        width={440}
      >
        {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}
        <form onSubmit={handleCreateOccupancy} style={{ display: 'grid', gap: '14px', marginTop: error ? '12px' : 0 }}>
          <label className="h-field">
            Unidad
            <SearchableSelect
              value={oUnitId}
              onChange={setOUnitId}
              searchPlaceholder="Buscar unidad..."
              options={units.map((u) => ({
                value: u.id,
                label: `Depto. ${u.number}`,
                keywords: u.number,
              }))}
            />
          </label>
          <label className="h-field">
            Persona
            <SearchableSelect
              value={oPersonId}
              onChange={setOPersonId}
              searchPlaceholder="Buscar persona o teléfono..."
              options={persons.map((p) => ({
                value: p.id,
                label: `${p.fullName} (${p.waPhone})`,
                keywords: p.waPhone,
              }))}
            />
          </label>
          <label className="h-field">
            Rol de ocupación
            <SearchableSelect
              value={oRole}
              onChange={setORole}
              searchPlaceholder="Buscar rol..."
              options={[
                { value: 'OWNER_RESIDENT', label: 'Propietario residente' },
                { value: 'LONG_TERM_TENANT', label: 'Arrendatario fijo' },
                { value: 'OWNER_LANDLORD', label: 'Propietario arrendador' },
                { value: 'AIRBNB_HOST', label: 'Anfitrión Airbnb' },
                { value: 'AIRBNB_GUEST', label: 'Huésped Airbnb' },
              ]}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label className="h-field">
              Vigente desde
              <input type="date" required value={oValidFrom} onChange={(e) => setOValidFrom(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Vigente hasta (opcional)
              <input type="date" value={oValidTo} onChange={(e) => setOValidTo(e.target.value)} className="h-input" />
            </label>
          </div>
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar ocupación'}
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
