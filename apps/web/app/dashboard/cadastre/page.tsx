'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Money, StatusBadge } from '@noah/ui';
import { useDashboard } from '../../../lib/dashboard-context';
import { downloadCsv } from '../../../lib/export-csv';

interface UnitTypeRow {
  id: string;
  code: string;
  name: string;
}

interface UnitRow {
  id: string;
  number: string;
  floor: number;
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

export default function CadastrePage() {
  const { me, tenantId, apiFetch } = useDashboard();
  const [tab, setTab] = useState<'units' | 'persons'>('units');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitTypeRow[]>([]);
  const [drawer, setDrawer] = useState<'unit' | 'person' | 'occupancy' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Unit form
  const [uNumber, setUNumber] = useState('');
  const [uFloor, setUFloor] = useState('1');
  const [uTypeId, setUTypeId] = useState('');
  const [uFeeUsd, setUFeeUsd] = useState('120');

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
    const [u, p, ut] = await Promise.all([
      apiFetch<UnitRow[]>('/cadastre/units'),
      apiFetch<PersonRow[]>('/cadastre/persons'),
      apiFetch<UnitTypeRow[]>('/catalog/unit-types'),
    ]);
    setUnits(u);
    setPersons(p);
    setUnitTypes(ut);
    if (!uTypeId && ut[0]) setUTypeId(ut[0].id);
    if (!oUnitId && u[0]) setOUnitId(u[0].id);
    if (!oPersonId && p[0]) setOPersonId(p[0].id);
  }, [apiFetch, tenantId, uTypeId, oUnitId, oPersonId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreateUnit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/cadastre/units', {
        method: 'POST',
        body: {
          number: uNumber,
          floor: Number(uFloor),
          unitTypeId: uTypeId,
          monthlyFeeCents: Math.round(Number(uFeeUsd) * 100),
        },
      });
      setUNumber('');
      setDrawer(null);
      setToast('Unidad creada correctamente.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear unidad.');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Catastro y ocupaciones</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Unidades, residentes (cédula cifrada y WhatsApp E.164) y vigencias de ocupación.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                'catastro-unidades.csv',
                ['Unidad', 'Piso', 'Tipología', 'Alícuota USD', 'Estado'],
                units.map((u) => [u.number, u.floor, u.unitType.name, (u.monthlyFeeCents / 100).toFixed(2), u.isActive ? 'Activa' : 'Inactiva']),
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
                onClick={() => { setError(null); setDrawer('unit'); }}
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
                onClick={() => { setError(null); setDrawer('person'); }}
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
                onClick={() => { setError(null); setDrawer('occupancy'); }}
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px' }}>Unidad</th>
                <th style={{ padding: '12px' }}>Piso</th>
                <th style={{ padding: '12px' }}>Tipología</th>
                <th style={{ padding: '12px' }}>Alícuota</th>
                <th style={{ padding: '12px' }}>Ocupantes</th>
                <th style={{ padding: '12px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{u.number}</td>
                  <td style={{ padding: '12px' }}>{u.floor}</td>
                  <td style={{ padding: '12px' }}>{u.unitType.name}</td>
                  <td style={{ padding: '12px' }}><Money cents={u.monthlyFeeCents} /></td>
                  <td style={{ padding: '12px', fontSize: '13px' }}>
                    {u.occupancies.length > 0 ? u.occupancies.map((o) => `${o.person.fullName} (${o.role})`).join(', ') : '—'}
                  </td>
                  <td style={{ padding: '12px' }}><StatusBadge status={u.isActive ? 'OK' : 'CANCELLED'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
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
            width: '400px',
            backgroundColor: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-border)',
            padding: '24px',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.14)',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>
              {drawer === 'unit' ? 'Nueva unidad' : drawer === 'person' ? 'Nueva persona' : 'Vincular ocupación'}
            </h2>
            <button type="button" onClick={() => setDrawer(null)}>✕</button>
          </div>

          {error && <div style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

          {drawer === 'unit' && (
            <form onSubmit={handleCreateUnit} style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Número de unidad (ej. 402)
                <input required value={uNumber} onChange={(e) => setUNumber(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Piso
                <input type="number" required value={uFloor} onChange={(e) => setUFloor(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Tipología
                <select value={uTypeId} onChange={(e) => setUTypeId(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                  {unitTypes.map((ut) => (
                    <option key={ut.id} value={ut.id}>{ut.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Alícuota mensual (USD)
                <input type="number" step="0.01" required value={uFeeUsd} onChange={(e) => setUFeeUsd(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
              </label>
              <button type="submit" style={{ padding: '10px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
                Guardar unidad
              </button>
            </form>
          )}

          {drawer === 'person' && (
            <form onSubmit={handleCreatePerson} style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Nombre completo
                <input required value={pName} onChange={(e) => setPName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Cédula o pasaporte (se guarda cifrada)
                <input required value={pNationalId} onChange={(e) => setPNationalId(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Teléfono WhatsApp (ej. 0984555922)
                <input required value={pPhone} onChange={(e) => setPPhone(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Correo electrónico (opcional)
                <input type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
              </label>
              <button type="submit" style={{ padding: '10px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>
                Guardar persona
              </button>
            </form>
          )}

          {drawer === 'occupancy' && (
            <form onSubmit={handleCreateOccupancy} style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Unidad
                <select value={oUnitId} onChange={(e) => setOUnitId(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                  {units.map((u) => <option key={u.id} value={u.id}>Depto. {u.number}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Persona
                <select value={oPersonId} onChange={(e) => setOPersonId(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                  {persons.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.waPhone})</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Rol de ocupación
                <select value={oRole} onChange={(e) => setORole(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }}>
                  <option value="OWNER_RESIDENT">Propietario residente</option>
                  <option value="LONG_TERM_TENANT">Arrendatario fijo</option>
                  <option value="OWNER_LANDLORD">Propietario arrendador</option>
                  <option value="AIRBNB_HOST">Anfitrión Airbnb</option>
                  <option value="AIRBNB_GUEST">Huésped Airbnb</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Vigente desde
                <input type="date" required value={oValidFrom} onChange={(e) => setOValidFrom(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                Vigente hasta (opcional)
                <input type="date" value={oValidTo} onChange={(e) => setOValidTo(e.target.value)} style={{ padding: '8px', border: '1px solid var(--color-border)' }} />
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
