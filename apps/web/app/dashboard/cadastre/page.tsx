'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Money, StatusBadge } from '@noah/ui';
import { useDashboard } from '../../../lib/dashboard-context';
import { downloadCsv } from '../../../lib/export-csv';

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

const inputStyle = {
  padding: '9px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: '14px',
  width: '100%',
} as const;

export default function CadastrePage() {
  const { me, tenantId, apiFetch } = useDashboard();
  const [tab, setTab] = useState<'units' | 'persons'>('units');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitTypeRow[]>([]);
  const [feePerSqmCents, setFeePerSqmCents] = useState(0);
  const [drawer, setDrawer] = useState<'unit' | 'person' | 'occupancy' | null>(null);
  const [editingUnit, setEditingUnit] = useState<UnitRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Unit form
  const [uNumber, setUNumber] = useState('');
  const [uFloor, setUFloor] = useState('1');
  const [uTypeId, setUTypeId] = useState('');
  const [uBedrooms, setUBedrooms] = useState('1');
  const [uAreaSqm, setUAreaSqm] = useState('');
  const [uManualFee, setUManualFee] = useState(false);
  const [uFeeUsd, setUFeeUsd] = useState('0.00');

  // Person form
  const [pName, setPName] = useState('');
  const [pNationalId, setPNationalId] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');

  // Occupancy form
  const [oUnitId, setOUnitId] = useState('');
  const [oPersonId, setOPersonId] = useState('');
  const [oRole, setORole] = useState('OWNER_RESIDENT');
  const [oValidFrom, setOValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [oValidTo, setOValidTo] = useState('');

  const canEdit = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
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
  }, [apiFetch, tenantId, uTypeId, oUnitId, oPersonId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const parsedArea = uAreaSqm.trim() !== '' ? Number(uAreaSqm) : null;
  const computedFeeCents =
    parsedArea !== null && Number.isFinite(parsedArea) && parsedArea > 0 && feePerSqmCents > 0
      ? Math.round(parsedArea * feePerSqmCents)
      : 0;

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
    setUFeeUsd('0.00');
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
    const autoExpected =
      u.areaSqm && feePerSqmCents > 0 ? Math.round(u.areaSqm * feePerSqmCents) : null;
    const isManual = autoExpected === null || autoExpected !== u.monthlyFeeCents;
    setUManualFee(isManual);
    setUFeeUsd((u.monthlyFeeCents / 100).toFixed(2));
    setDrawer('unit');
  }

  function handleTypeChange(nextTypeId: string) {
    setUTypeId(nextTypeId);
    const found = unitTypes.find((ut) => ut.id === nextTypeId);
    if (found) {
      setUBedrooms(String(found.bedrooms ?? 1));
    }
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
      ...(uManualFee ? { monthlyFeeCents: Math.round(Number(uFeeUsd) * 100) } : {}),
    };
    try {
      if (editingUnit) {
        await apiFetch(`/cadastre/units/${editingUnit.id}`, {
          method: 'PATCH',
          body: payload,
        });
        setToast(`Unidad ${uNumber} actualizada.`);
      } else {
        await apiFetch('/cadastre/units', {
          method: 'POST',
          body: payload,
        });
        setToast(`Unidad ${uNumber} creada correctamente.`);
      }
      setEditingUnit(null);
      setDrawer(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar unidad.');
    }
  }

  async function handleCreatePerson(e: FormEvent) {
    e.preventDefault();
    setError(null);
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
    }
  }

  async function handleCreateOccupancy(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/cadastre/occupancies', {
        method: 'POST',
        body: {
          unitId: oUnitId,
          personId: oPersonId,
          role: oRole,
          validFrom: new Date(`${oValidFrom}T00:00:00-05:00`).toISOString(),
          ...(oValidTo ? { validTo: new Date(`${oValidTo}T23:59:59-05:00`).toISOString() } : {}),
        },
      });
      setDrawer(null);
      setToast('Ocupación registrada.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar ocupación.');
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Catastro y ocupaciones</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Unidades (metraje, dormitorios y alícuota automática a{' '}
            <strong>
              <Money cents={feePerSqmCents} />/m²
            </strong>
            ), residentes y ocupaciones.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
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
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Exportar CSV
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={openCreateUnit}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                + Unidad
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setDrawer('person');
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-primary)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                + Persona
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setDrawer('occupancy');
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                + Ocupación
              </button>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-success)', color: 'var(--color-success)', fontSize: '13px' }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
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
            fontWeight: 600,
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
            fontWeight: 600,
          }}
        >
          Personas ({persons.length})
        </button>
      </div>

      {tab === 'units' ? (
        units.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay unidades registradas. Crea la primera con «+ Unidad».</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px' }}>Unidad</th>
                  <th style={{ padding: '12px' }}>Piso</th>
                  <th style={{ padding: '12px' }}>Tipología</th>
                  <th style={{ padding: '12px' }}>Dorm.</th>
                  <th style={{ padding: '12px' }}>Metraje</th>
                  <th style={{ padding: '12px' }}>Alícuota</th>
                  <th style={{ padding: '12px' }}>Ocupantes</th>
                  <th style={{ padding: '12px' }}>Estado</th>
                  {canEdit && <th style={{ padding: '12px', textAlign: 'right' }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{u.number}</td>
                    <td style={{ padding: '12px' }}>{u.floor}</td>
                    <td style={{ padding: '12px' }}>{u.unitType.name}</td>
                    <td style={{ padding: '12px' }}>{u.bedrooms ?? 1}</td>
                    <td style={{ padding: '12px' }}>{u.areaSqm ? `${u.areaSqm} m²` : '—'}</td>
                    <td style={{ padding: '12px' }}><Money cents={u.monthlyFeeCents} /></td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>
                      {u.occupancies.length > 0 ? u.occupancies.map((o) => `${o.person.fullName} (${o.role})`).join(', ') : '—'}
                    </td>
                    <td style={{ padding: '12px' }}><StatusBadge status={u.isActive ? 'OK' : 'CANCELLED'} /></td>
                    {canEdit && (
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => openEditUnit(u)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border)',
                            backgroundColor: 'var(--color-bg)',
                            color: 'var(--color-text)',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Editar
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
        <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay personas registradas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px' }}>Nombre</th>
              <th style={{ padding: '12px' }}>Cédula (enmascarada)</th>
              <th style={{ padding: '12px' }}>WhatsApp</th>
              <th style={{ padding: '12px' }}>Correo</th>
            </tr>
          </thead>
          <tbody>
            {persons.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px', fontWeight: 500 }}>{p.fullName}</td>
                <td style={{ padding: '12px', fontFamily: 'monospace' }}>{p.nationalId}</td>
                <td style={{ padding: '12px' }}>{p.waPhone}</td>
                <td style={{ padding: '12px' }}>{p.email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drawer && (
        <aside
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '430px',
            maxWidth: '100%',
            backgroundColor: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.14)',
            overflowY: 'auto',
            zIndex: 50,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>
              {drawer === 'unit'
                ? editingUnit
                  ? `Editar unidad ${editingUnit.number}`
                  : 'Nueva unidad'
                : drawer === 'person'
                  ? 'Nueva persona'
                  : 'Vincular ocupación'}
            </h2>
            <button type="button" onClick={() => setDrawer(null)}>✕</button>
          </div>

          {error && <div style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

          {drawer === 'unit' && (
            <form onSubmit={handleSaveUnit} style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                  Número de unidad (ej. 402)
                  <input required value={uNumber} onChange={(e) => setUNumber(e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                  Piso
                  <input type="number" required value={uFloor} onChange={(e) => setUFloor(e.target.value)} style={inputStyle} />
                </label>
              </div>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Tipología
                <select value={uTypeId} onChange={(e) => handleTypeChange(e.target.value)} style={inputStyle}>
                  {unitTypes.map((ut) => (
                    <option key={ut.id} value={ut.id}>
                      {ut.name}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                  Dormitorios
                  <input type="number" min="0" required value={uBedrooms} onChange={(e) => setUBedrooms(e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                  Metraje (m²)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="ej. 68.50"
                    value={uAreaSqm}
                    onChange={(e) => setUAreaSqm(e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  fontSize: '13px',
                }}
              >
                <div style={{ color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Cálculo automático de alícuota (<Money cents={feePerSqmCents} /> / m²):
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  {parsedArea && feePerSqmCents > 0 ? (
                    <>
                      {parsedArea} m² × <Money cents={feePerSqmCents} /> = <Money cents={computedFeeCents} /> / mes
                    </>
                  ) : (
                    <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--color-text-muted)' }}>
                      Ingresa el metraje (o configura el precio/m² en Configurador → Parámetros).
                    </span>
                  )}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <input type="checkbox" checked={uManualFee} onChange={(e) => setUManualFee(e.target.checked)} />
                Definir alícuota manualmente (sobrescribir cálculo por m²)
              </label>

              {uManualFee && (
                <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                  Alícuota mensual manual (USD)
                  <input type="number" step="0.01" min="0" required value={uFeeUsd} onChange={(e) => setUFeeUsd(e.target.value)} style={inputStyle} />
                </label>
              )}

              <button type="submit" style={{ padding: '10px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
                {editingUnit ? 'Guardar cambios' : 'Guardar unidad'}
              </button>
            </form>
          )}

          {drawer === 'person' && (
            <form onSubmit={handleCreatePerson} style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Nombre completo
                <input required value={pName} onChange={(e) => setPName(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Cédula o pasaporte (se guarda cifrada)
                <input required value={pNationalId} onChange={(e) => setPNationalId(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Teléfono WhatsApp (ej. 0984555922)
                <input required value={pPhone} onChange={(e) => setPPhone(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Correo electrónico (opcional)
                <input type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} style={inputStyle} />
              </label>
              <button type="submit" style={{ padding: '10px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
                Guardar persona
              </button>
            </form>
          )}

          {drawer === 'occupancy' && (
            <form onSubmit={handleCreateOccupancy} style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Unidad
                <select value={oUnitId} onChange={(e) => setOUnitId(e.target.value)} style={inputStyle}>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      Depto. {u.number}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Persona
                <select value={oPersonId} onChange={(e) => setOPersonId(e.target.value)} style={inputStyle}>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.waPhone})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Rol de ocupación
                <select value={oRole} onChange={(e) => setORole(e.target.value)} style={inputStyle}>
                  <option value="OWNER_RESIDENT">Propietario residente</option>
                  <option value="LONG_TERM_TENANT">Arrendatario fijo</option>
                  <option value="OWNER_LANDLORD">Propietario arrendador</option>
                  <option value="AIRBNB_HOST">Anfitrión Airbnb</option>
                  <option value="AIRBNB_GUEST">Huésped Airbnb</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Vigente desde
                <input type="date" required value={oValidFrom} onChange={(e) => setOValidFrom(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                Vigente hasta (opcional)
                <input type="date" value={oValidTo} onChange={(e) => setOValidTo(e.target.value)} style={inputStyle} />
              </label>
              <button type="submit" style={{ padding: '10px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
                Guardar ocupación
              </button>
            </form>
          )}
        </aside>
      )}
    </section>
  );
}
