'use client';

import { useCallback, useEffect, useState } from 'react';
import { Money, StatusBadge } from '@noah/ui';
import {
  type AccessRuleDto,
  type AmenityDto,
  catalogApi,
  type CleaningComboDto,
  type ParkingConfigDto,
  type TenantSettingsDto,
  type UnitTypeDto,
} from '../../../lib/api/catalog';
import { useDashboard } from '../../../lib/dashboard-context';

const ROLES: Array<{ key: AccessRuleDto['occupancyRole']; label: string }> = [
  { key: 'OWNER_RESIDENT', label: 'Propietario' },
  { key: 'LONG_TERM_TENANT', label: 'Arrendatario fijo' },
  { key: 'OWNER_LANDLORD', label: 'Arrendador' },
  { key: 'AIRBNB_HOST', label: 'Anfitrión Airbnb' },
  { key: 'AIRBNB_GUEST', label: 'Huésped Airbnb' },
];

type TabKey = 'amenities' | 'matrix' | 'combos' | 'unitTypes' | 'settings' | 'parking';

export default function BuildingConfigPage() {
  const { token, me, tenantId } = useDashboard();
  const [tab, setTab] = useState<TabKey>('amenities');
  const [settings, setSettings] = useState<TenantSettingsDto | null>(null);
  const [unitTypes, setUnitTypes] = useState<UnitTypeDto[]>([]);
  const [amenities, setAmenities] = useState<AmenityDto[]>([]);
  const [combos, setCombos] = useState<CleaningComboDto[]>([]);
  const [parking, setParking] = useState<ParkingConfigDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    const [s, ut, am, cb, pk] = await Promise.all([
      catalogApi.getSettings(token, tenantId),
      catalogApi.listUnitTypes(token, tenantId),
      catalogApi.listAmenities(token, tenantId),
      catalogApi.listCombos(token, tenantId),
      catalogApi.getParking(token, tenantId),
    ]);
    setSettings(s);
    setUnitTypes(ut);
    setAmenities(am);
    setCombos(cb);
    setParking(pk);
  }, [token, tenantId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function toggleAccess(
    amenityId: string,
    occupancyRole: AccessRuleDto['occupancyRole'],
    currentAllowed: boolean,
  ) {
    if (!tenantId || !canEdit) return;
    await catalogApi.setAccessRule(token, tenantId, {
      amenityId,
      occupancyRole,
      allowed: !currentAllowed,
    });
    setMessage('Matriz de acceso actualizada y registrada en auditoría.');
    await loadAll();
  }

  const amenityNameById = new Map(amenities.map((a) => [a.id, a.name]));

  return (
    <section>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px' }}>Configurador del edificio</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Todos los parámetros viven en la base de datos por edificio y aplican a reservas nuevas.
        </p>
      </div>

      <nav style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(
          [
            ['amenities', `Áreas (${amenities.length})`],
            ['matrix', 'Matriz de acceso'],
            ['combos', `Combos (${combos.length})`],
            ['unitTypes', `Tipologías (${unitTypes.length})`],
            ['settings', 'Parámetros'],
            ['parking', 'Parqueaderos'],
          ] as Array<[TabKey, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              backgroundColor: tab === key ? 'var(--color-primary)' : 'var(--color-surface)',
              color: tab === key ? '#ffffff' : 'var(--color-text)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {message && (
        <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--color-success)' }}>{message}</div>
      )}

      {tab === 'amenities' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px' }}>Área</th>
              <th style={{ padding: '12px' }}>Aforo</th>
              <th style={{ padding: '12px' }}>Duración máx.</th>
              <th style={{ padding: '12px' }}>Modo</th>
              <th style={{ padding: '12px' }}>Cupos</th>
              <th style={{ padding: '12px' }}>Limpieza</th>
            </tr>
          </thead>
          <tbody>
            {amenities.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px', fontWeight: 500 }}>{a.name}</td>
                <td style={{ padding: '12px' }}>{a.capacity} pers.</td>
                <td style={{ padding: '12px' }}>{a.maxDurationMinutes / 60} h</td>
                <td style={{ padding: '12px' }}><StatusBadge status={a.mode === 'EXCLUSIVE' ? 'IN_REVIEW' : 'OK'} /></td>
                <td style={{ padding: '12px' }}>{a.appliesGuestQuota ? 'Sí' : 'No'}</td>
                <td style={{ padding: '12px' }}>{a.cleaningFeeCents > 0 ? <Money cents={a.cleaningFeeCents} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'matrix' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px' }}>Área</th>
              {ROLES.map((r) => <th key={r.key} style={{ padding: '12px', textAlign: 'center' }}>{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {amenities.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px', fontWeight: 500 }}>{a.name}</td>
                {ROLES.map((r) => {
                  const rule = a.accessRules.find((ar) => ar.occupancyRole === r.key);
                  const allowed = rule?.allowed ?? false;
                  return (
                    <td key={r.key} style={{ padding: '12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={allowed} disabled={!canEdit} onChange={() => toggleAccess(a.id, r.key, allowed)} aria-label={`${a.name} - ${r.label}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'combos' && (
        <div style={{ display: 'grid', gap: '12px' }}>
          {combos.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
              <span>{c.amenityIds.map((id) => amenityNameById.get(id) ?? id).join(' + ')}</span>
              <strong><Money cents={c.feeCents} /></strong>
            </div>
          ))}
        </div>
      )}

      {tab === 'unitTypes' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px' }}>Código</th>
              <th style={{ padding: '12px' }}>Tipología</th>
              <th style={{ padding: '12px' }}>Invitados incluidos</th>
            </tr>
          </thead>
          <tbody>
            {unitTypes.map((ut) => (
              <tr key={ut.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px', fontFamily: 'monospace' }}>{ut.code}</td>
                <td style={{ padding: '12px' }}>{ut.name}</td>
                <td style={{ padding: '12px' }}>1 residente + {ut.includedGuests} invitados</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'settings' && settings && (
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', fontSize: '14px' }}>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Garantía requerida</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}><Money cents={settings.depositRequiredCents} /></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Tolerancia de mora</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{settings.arrearsToleranceMonths} meses</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Invitado extra declarado</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}><Money cents={settings.extraGuestDeclaredCents} /></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Invitado extra no declarado</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}><Money cents={settings.extraGuestUndeclaredCents} /></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Plazo comprobante limpieza</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{settings.paymentProofDeadlineMinutes} min</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Margen de entrada QR</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{settings.entryMarginMinutes} min</dd></div>
        </dl>
      )}

      {tab === 'parking' && parking && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', fontSize: '14px' }}>
          <p style={{ margin: '0 0 8px' }}><strong>Puestos de visitas:</strong> {parking.spots}</p>
          <p style={{ margin: '0 0 8px' }}><strong>Tiempo gratuito:</strong> {parking.freeMinutes} minutos ({parking.freeMinutes / 60} h)</p>
          <p style={{ margin: 0 }}><strong>Tarifa por exceso:</strong> <Money cents={parking.overtimeFeeCentsPerHour} /> por hora o fracción</p>
        </div>
      )}
    </section>
  );
}
