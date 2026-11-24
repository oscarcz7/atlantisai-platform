'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
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

const MODE_LABELS: Record<AmenityDto['mode'], string> = {
  SHARED: 'Compartida',
  EXCLUSIVE: 'Exclusiva',
  FREE_USE: 'Uso libre',
};

const PERIOD_LABELS: Record<'DAY' | 'WEEK' | 'MONTH', string> = {
  DAY: 'día',
  WEEK: 'semana',
  MONTH: 'mes',
};

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
  padding: '7px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontWeight: 500,
  cursor: 'pointer',
  fontSize: '12px',
} as const;

const dangerBtn = {
  padding: '7px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-danger)',
  backgroundColor: 'transparent',
  color: 'var(--color-danger)',
  fontWeight: 500,
  cursor: 'pointer',
  fontSize: '12px',
} as const;

type TabKey = 'settings' | 'amenities' | 'matrix' | 'combos' | 'unitTypes' | 'parking';

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(val: string): number {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function BuildingConfigPage() {
  const { token, me, tenantId } = useDashboard();
  const [tab, setTab] = useState<TabKey>('settings');
  const [settings, setSettings] = useState<TenantSettingsDto | null>(null);
  const [unitTypes, setUnitTypes] = useState<UnitTypeDto[]>([]);
  const [amenities, setAmenities] = useState<AmenityDto[]>([]);
  const [combos, setCombos] = useState<CleaningComboDto[]>([]);
  const [parking, setParking] = useState<ParkingConfigDto | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Settings editable state
  const [feePerSqm, setFeePerSqm] = useState('3.00');
  const [depositDollars, setDepositDollars] = useState('200.00');
  const [arrearsTolerance, setArrearsTolerance] = useState('2');
  const [extraDeclared, setExtraDeclared] = useState('5.00');
  const [extraUndeclared, setExtraUndeclared] = useState('10.00');
  const [proofDeadline, setProofDeadline] = useState('240');
  const [entryMargin, setEntryMargin] = useState('10');
  const [generalAdvance, setGeneralAdvance] = useState('24');
  const [shortNotice, setShortNotice] = useState('60');
  const [weekStart, setWeekStart] = useState('MONDAY');
  const [cancelMinHours, setCancelMinHours] = useState('24');
  const [cancelCleaning, setCancelCleaning] = useState<'NON_REFUNDABLE' | 'REFUNDABLE' | 'CREDIT'>('NON_REFUNDABLE');

  // Parking editable state
  const [parkingSpots, setParkingSpots] = useState('4');
  const [parkingFreeMins, setParkingFreeMins] = useState('180');
  const [parkingOvertimeDollars, setParkingOvertimeDollars] = useState('2.00');
  const [parkingRounding, setParkingRounding] = useState('CEIL_HOUR');

  // Amenity drawer state
  const [amenityDrawer, setAmenityDrawer] = useState<'none' | 'create' | 'edit'>('none');
  const [amCode, setAmCode] = useState('');
  const [amName, setAmName] = useState('');
  const [amCapacity, setAmCapacity] = useState('20');
  const [amDuration, setAmDuration] = useState('120');
  const [amMode, setAmMode] = useState<AmenityDto['mode']>('SHARED');
  const [amAdvance, setAmAdvance] = useState<AmenityDto['advancePolicy']>('SHORT_NOTICE_ALLOWED');
  const [amHasSchedule, setAmHasSchedule] = useState(true);
  const [amOpen, setAmOpen] = useState('08:00');
  const [amClose, setAmClose] = useState('22:00');
  const [amFreqPeriod, setAmFreqPeriod] = useState<'NONE' | 'DAY' | 'WEEK' | 'MONTH'>('WEEK');
  const [amFreqMax, setAmFreqMax] = useState('3');
  const [amGuestQuota, setAmGuestQuota] = useState(true);
  const [amRequiresDeposit, setAmRequiresDeposit] = useState(false);
  const [amCleaningDollars, setAmCleaningDollars] = useState('0.00');
  const [amHasReader, setAmHasReader] = useState(true);

  // UnitType drawer state
  const [utDrawer, setUtDrawer] = useState<'none' | 'create' | 'edit'>('none');
  const [utCode, setUtCode] = useState('');
  const [utName, setUtName] = useState('');
  const [utBedrooms, setUtBedrooms] = useState('1');
  const [utGuests, setUtGuests] = useState('2');

  // Combo drawer state
  const [comboDrawer, setComboDrawer] = useState(false);
  const [comboAmenityIds, setComboAmenityIds] = useState<string[]>([]);
  const [comboFeeDollars, setComboFeeDollars] = useState('50.00');

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
    if (s) {
      setFeePerSqm(centsToDollars(s.monthlyFeePerSqmCents ?? 0));
      setDepositDollars(centsToDollars(s.depositRequiredCents));
      setArrearsTolerance(String(s.arrearsToleranceMonths));
      setExtraDeclared(centsToDollars(s.extraGuestDeclaredCents));
      setExtraUndeclared(centsToDollars(s.extraGuestUndeclaredCents));
      setProofDeadline(String(s.paymentProofDeadlineMinutes));
      setEntryMargin(String(s.entryMarginMinutes));
      setGeneralAdvance(String(s.generalAdvanceHours));
      setShortNotice(String(s.shortNoticeAdvanceMinutes));
      setWeekStart(s.frequencyWeekStart || 'MONDAY');
      setCancelMinHours(String(s.cancellationPolicy?.minHoursBefore ?? 24));
      setCancelCleaning(s.cancellationPolicy?.cleaningFeeHandling ?? 'NON_REFUNDABLE');
    }
    setUnitTypes(ut);
    setAmenities(am);
    setCombos(cb);
    setParking(pk);
    if (pk) {
      setParkingSpots(String(pk.spots));
      setParkingFreeMins(String(pk.freeMinutes));
      setParkingOvertimeDollars(centsToDollars(pk.overtimeFeeCentsPerHour));
      setParkingRounding(pk.rounding || 'CEIL_HOUR');
    }
  }, [token, tenantId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !canEdit) return;
    setBusy(true);
    setFeedback(null);
    try {
      await catalogApi.saveSettings(token, tenantId, {
        monthlyFeePerSqmCents: dollarsToCents(feePerSqm),
        depositRequiredCents: dollarsToCents(depositDollars),
        arrearsToleranceMonths: Number(arrearsTolerance),
        extraGuestDeclaredCents: dollarsToCents(extraDeclared),
        extraGuestUndeclaredCents: dollarsToCents(extraUndeclared),
        paymentProofDeadlineMinutes: Number(proofDeadline),
        entryMarginMinutes: Number(entryMargin),
        generalAdvanceHours: Number(generalAdvance),
        shortNoticeAdvanceMinutes: Number(shortNotice),
        frequencyWeekStart: weekStart,
        cancellationPolicy: {
          minHoursBefore: Number(cancelMinHours),
          cleaningFeeHandling: cancelCleaning,
        },
      });
      setFeedback({ type: 'ok', text: 'Parámetros del edificio guardados y registrados en auditoría.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar parámetros.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveParking(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !canEdit) return;
    setBusy(true);
    setFeedback(null);
    try {
      await catalogApi.saveParking(token, tenantId, {
        spots: Number(parkingSpots),
        freeMinutes: Number(parkingFreeMins),
        overtimeFeeCentsPerHour: dollarsToCents(parkingOvertimeDollars),
        rounding: parkingRounding,
      });
      setFeedback({ type: 'ok', text: 'Configuración de parqueaderos actualizada.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar parqueaderos.' });
    } finally {
      setBusy(false);
    }
  }

  function openCreateAmenity() {
    setAmCode('');
    setAmName('');
    setAmCapacity('20');
    setAmDuration('120');
    setAmMode('SHARED');
    setAmAdvance('SHORT_NOTICE_ALLOWED');
    setAmHasSchedule(true);
    setAmOpen('08:00');
    setAmClose('22:00');
    setAmFreqPeriod('WEEK');
    setAmFreqMax('3');
    setAmGuestQuota(true);
    setAmRequiresDeposit(false);
    setAmCleaningDollars('0.00');
    setAmHasReader(true);
    setAmenityDrawer('create');
  }

  function openEditAmenity(a: AmenityDto) {
    setAmCode(a.code);
    setAmName(a.name);
    setAmCapacity(String(a.capacity));
    setAmDuration(String(a.maxDurationMinutes));
    setAmMode(a.mode);
    setAmAdvance(a.advancePolicy);
    const sched = a.schedule?.all;
    setAmHasSchedule(Boolean(sched));
    setAmOpen(sched?.open ?? '08:00');
    setAmClose(sched?.close ?? '22:00');
    setAmFreqPeriod(a.frequency ? a.frequency.period : 'NONE');
    setAmFreqMax(String(a.frequency?.max ?? 1));
    setAmGuestQuota(a.appliesGuestQuota);
    setAmRequiresDeposit(a.requiresDeposit);
    setAmCleaningDollars(centsToDollars(a.cleaningFeeCents));
    setAmHasReader(a.hasReader);
    setAmenityDrawer('edit');
  }

  async function handleSaveAmenity(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !canEdit) return;
    setBusy(true);
    setFeedback(null);
    try {
      await catalogApi.upsertAmenity(token, tenantId, {
        code: amCode.trim().toUpperCase(),
        name: amName.trim(),
        capacity: Number(amCapacity),
        maxDurationMinutes: Number(amDuration),
        mode: amMode,
        advancePolicy: amAdvance,
        schedule: amHasSchedule ? { all: { open: amOpen, close: amClose } } : null,
        frequency: amFreqPeriod === 'NONE' ? null : { period: amFreqPeriod, max: Number(amFreqMax) },
        appliesGuestQuota: amGuestQuota,
        requiresDeposit: amRequiresDeposit,
        cleaningFeeCents: dollarsToCents(amCleaningDollars),
        hasReader: amHasReader,
      });
      setAmenityDrawer('none');
      setFeedback({ type: 'ok', text: `Área comunal "${amName}" guardada.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar área.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAmenity(a: AmenityDto) {
    if (!tenantId || !canEdit) return;
    if (!window.confirm(`¿Eliminar el área "${a.name}"?`)) return;
    setFeedback(null);
    try {
      await catalogApi.deleteAmenity(token, tenantId, a.id);
      setFeedback({ type: 'ok', text: `Área "${a.name}" eliminada.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'No se pudo eliminar el área.' });
    }
  }

  function openCreateUnitType() {
    setUtCode('');
    setUtName('');
    setUtBedrooms('1');
    setUtGuests('2');
    setUtDrawer('create');
  }

  function openEditUnitType(ut: UnitTypeDto) {
    setUtCode(ut.code);
    setUtName(ut.name);
    setUtBedrooms(String(ut.bedrooms ?? 1));
    setUtGuests(String(ut.includedGuests));
    setUtDrawer('edit');
  }

  async function handleSaveUnitType(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !canEdit) return;
    setBusy(true);
    setFeedback(null);
    try {
      await catalogApi.upsertUnitType(token, tenantId, {
        code: utCode.trim().toUpperCase(),
        name: utName.trim(),
        bedrooms: Number(utBedrooms),
        includedGuests: Number(utGuests),
      });
      setUtDrawer('none');
      setFeedback({ type: 'ok', text: `Tipología "${utName}" guardada.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar tipología.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUnitType(ut: UnitTypeDto) {
    if (!tenantId || !canEdit) return;
    if (!window.confirm(`¿Eliminar la tipología "${ut.name}"?`)) return;
    setFeedback(null);
    try {
      await catalogApi.deleteUnitType(token, tenantId, ut.id);
      setFeedback({ type: 'ok', text: `Tipología "${ut.name}" eliminada.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'No se pudo eliminar la tipología.' });
    }
  }

  async function handleCreateCombo(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !canEdit) return;
    setBusy(true);
    setFeedback(null);
    try {
      await catalogApi.createCombo(token, tenantId, {
        amenityIds: comboAmenityIds,
        feeCents: dollarsToCents(comboFeeDollars),
      });
      setComboDrawer(false);
      setComboAmenityIds([]);
      setFeedback({ type: 'ok', text: 'Combo de limpieza creado.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al crear combo.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCombo(id: string) {
    if (!tenantId || !canEdit) return;
    if (!window.confirm('¿Eliminar este combo de limpieza?')) return;
    setFeedback(null);
    try {
      await catalogApi.deleteCombo(token, tenantId, id);
      setFeedback({ type: 'ok', text: 'Combo eliminado.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al eliminar combo.' });
    }
  }

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
    setFeedback({ type: 'ok', text: 'Matriz de acceso actualizada y registrada en auditoría.' });
    await loadAll();
  }

  const amenityNameById = new Map(amenities.map((a) => [a.id, a.name]));
  const paidAmenities = amenities.filter((a) => a.cleaningFeeCents > 0);

  return (
    <section>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px' }}>Configurador del edificio</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Todos los parámetros, áreas, tarifas y reglas del reglamento se configuran por edificio sin tocar código.
        </p>
      </div>

      <nav style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(
          [
            ['settings', 'Parámetros y Alícuota'],
            ['amenities', `Áreas comunales (${amenities.length})`],
            ['matrix', 'Matriz de acceso'],
            ['unitTypes', `Tipologías (${unitTypes.length})`],
            ['combos', `Combos limpieza (${combos.length})`],
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

      {tab === 'settings' && settings && (
        <form
          onSubmit={handleSaveSettings}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '22px',
            display: 'grid',
            gap: '18px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Costo de alícuota por m² (USD / m²)
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canEdit}
                value={feePerSqm}
                onChange={(e) => setFeePerSqm(e.target.value)}
                style={inputStyle}
              />
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                Se usa para calcular automáticamente la alícuota de cada unidad según su metraje.
              </span>
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Garantía requerida (USD)
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canEdit}
                value={depositDollars}
                onChange={(e) => setDepositDollars(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Tolerancia de mora (meses impagos)
              <input
                type="number"
                min="0"
                disabled={!canEdit}
                value={arrearsTolerance}
                onChange={(e) => setArrearsTolerance(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Invitado extra declarado (USD)
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canEdit}
                value={extraDeclared}
                onChange={(e) => setExtraDeclared(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Invitado extra no declarado / multa (USD)
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canEdit}
                value={extraUndeclared}
                onChange={(e) => setExtraUndeclared(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Plazo envío comprobante limpieza (min)
              <input
                type="number"
                min="1"
                disabled={!canEdit}
                value={proofDeadline}
                onChange={(e) => setProofDeadline(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Margen de entrada QR antes del inicio (min)
              <input
                type="number"
                min="0"
                disabled={!canEdit}
                value={entryMargin}
                onChange={(e) => setEntryMargin(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Anticipación general de reserva (horas)
              <input
                type="number"
                min="0"
                disabled={!canEdit}
                value={generalAdvance}
                onChange={(e) => setGeneralAdvance(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Anticipación aviso corto áreas compartidas (min)
              <input
                type="number"
                min="0"
                disabled={!canEdit}
                value={shortNotice}
                onChange={(e) => setShortNotice(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Inicio de semana para frecuencias
              <select disabled={!canEdit} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} style={inputStyle}>
                <option value="MONDAY">Lunes</option>
                <option value="SUNDAY">Domingo</option>
              </select>
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Cancelación sin penalidad (horas antes)
              <input
                type="number"
                min="0"
                disabled={!canEdit}
                value={cancelMinHours}
                onChange={(e) => setCancelMinHours(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Tarifa de limpieza al cancelar
              <select
                disabled={!canEdit}
                value={cancelCleaning}
                onChange={(e) => setCancelCleaning(e.target.value as 'NON_REFUNDABLE' | 'REFUNDABLE' | 'CREDIT')}
                style={inputStyle}
              >
                <option value="NON_REFUNDABLE">No reembolsable (Manual NOAH)</option>
                <option value="CREDIT">Crédito a favor</option>
                <option value="REFUNDABLE">Reembolsable</option>
              </select>
            </label>
          </div>

          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={busy} style={primaryBtn}>
                {busy ? 'Guardando...' : 'Guardar parámetros'}
              </button>
            </div>
          )}
        </form>
      )}

      {tab === 'amenities' && (
        <div>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button type="button" style={primaryBtn} onClick={openCreateAmenity}>
                + Nueva área comunal
              </button>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px' }}>Área</th>
                  <th style={{ padding: '12px' }}>Aforo</th>
                  <th style={{ padding: '12px' }}>Duración</th>
                  <th style={{ padding: '12px' }}>Horario</th>
                  <th style={{ padding: '12px' }}>Frecuencia</th>
                  <th style={{ padding: '12px' }}>Modo</th>
                  <th style={{ padding: '12px' }}>Limpieza</th>
                  {canEdit && <th style={{ padding: '12px', textAlign: 'right' }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {amenities.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                        {a.code} {a.appliesGuestQuota ? '· Cupos' : ''} {a.requiresDeposit ? '· Garantía' : ''} {a.hasReader ? '· QR' : ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>{a.capacity} pers.</td>
                    <td style={{ padding: '12px' }}>{a.maxDurationMinutes / 60} h</td>
                    <td style={{ padding: '12px' }}>
                      {a.schedule?.all ? `${a.schedule.all.open}–${a.schedule.all.close}` : 'Sin límite'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {a.frequency ? `${a.frequency.max}/${PERIOD_LABELS[a.frequency.period]}` : 'Libre'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <StatusBadge status={a.mode === 'EXCLUSIVE' ? 'IN_REVIEW' : 'OK'} />{' '}
                      <span style={{ fontSize: '12px' }}>{MODE_LABELS[a.mode]}</span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {a.cleaningFeeCents > 0 ? <Money cents={a.cleaningFeeCents} /> : '—'}
                    </td>
                    {canEdit && (
                      <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" style={{ ...secondaryBtn, marginRight: '6px' }} onClick={() => openEditAmenity(a)}>
                          Editar
                        </button>
                        <button type="button" style={dangerBtn} onClick={() => void handleDeleteAmenity(a)}>
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'matrix' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px' }}>Área</th>
                {ROLES.map((r) => (
                  <th key={r.key} style={{ padding: '12px', textAlign: 'center' }}>
                    {r.label}
                  </th>
                ))}
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
                        <input
                          type="checkbox"
                          checked={allowed}
                          disabled={!canEdit}
                          onChange={() => void toggleAccess(a.id, r.key, allowed)}
                          aria-label={`${a.name} - ${r.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'unitTypes' && (
        <div>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button type="button" style={primaryBtn} onClick={openCreateUnitType}>
                + Nueva tipología
              </button>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px' }}>Código</th>
                <th style={{ padding: '12px' }}>Tipología</th>
                <th style={{ padding: '12px' }}>Dormitorios</th>
                <th style={{ padding: '12px' }}>Invitados incluidos</th>
                {canEdit && <th style={{ padding: '12px', textAlign: 'right' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {unitTypes.map((ut) => (
                <tr key={ut.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '12px', fontFamily: 'monospace' }}>{ut.code}</td>
                  <td style={{ padding: '12px', fontWeight: 500 }}>{ut.name}</td>
                  <td style={{ padding: '12px' }}>{ut.bedrooms ?? 1}</td>
                  <td style={{ padding: '12px' }}>1 residente + {ut.includedGuests} invitados</td>
                  {canEdit && (
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button type="button" style={{ ...secondaryBtn, marginRight: '6px' }} onClick={() => openEditUnitType(ut)}>
                        Editar
                      </button>
                      <button type="button" style={dangerBtn} onClick={() => void handleDeleteUnitType(ut)}>
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'combos' && (
        <div>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button type="button" style={primaryBtn} onClick={() => setComboDrawer(true)}>
                + Nuevo combo de limpieza
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gap: '10px' }}>
            {combos.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span>{c.amenityIds.map((id) => amenityNameById.get(id) ?? id).join(' + ')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <strong>
                    <Money cents={c.feeCents} />
                  </strong>
                  {canEdit && (
                    <button type="button" style={dangerBtn} onClick={() => void handleDeleteCombo(c.id)}>
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'parking' && parking && (
        <form
          onSubmit={handleSaveParking}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '22px',
            display: 'grid',
            gap: '16px',
            maxWidth: '640px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Puestos de parqueo de visitas
              <input type="number" min="0" disabled={!canEdit} value={parkingSpots} onChange={(e) => setParkingSpots(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Tiempo gratuito (minutos)
              <input type="number" min="0" disabled={!canEdit} value={parkingFreeMins} onChange={(e) => setParkingFreeMins(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Tarifa por exceso (USD / hora)
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canEdit}
                value={parkingOvertimeDollars}
                onChange={(e) => setParkingOvertimeDollars(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Redondeo de exceso
              <select disabled={!canEdit} value={parkingRounding} onChange={(e) => setParkingRounding(e.target.value)} style={inputStyle}>
                <option value="CEIL_HOUR">Hora o fracción (redondeo hacia arriba)</option>
                <option value="EXACT_MINUTE">Proporcional por minuto</option>
              </select>
            </label>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={busy} style={primaryBtn}>
                {busy ? 'Guardando...' : 'Guardar parqueaderos'}
              </button>
            </div>
          )}
        </form>
      )}

      {amenityDrawer !== 'none' && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <form
            onSubmit={handleSaveAmenity}
            style={{
              width: '100%',
              maxWidth: '500px',
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
                {amenityDrawer === 'create' ? 'Nueva área comunal' : `Editar ${amName}`}
              </h2>
              <button type="button" style={secondaryBtn} onClick={() => setAmenityDrawer('none')}>
                Cerrar
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Código único
                <input required disabled={amenityDrawer === 'edit'} value={amCode} onChange={(e) => setAmCode(e.target.value)} placeholder="BBQ_ROOFTOP" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Nombre del área
                <input required value={amName} onChange={(e) => setAmName(e.target.value)} placeholder="BBQ Terraza" style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Aforo máximo (personas)
                <input type="number" min="1" required value={amCapacity} onChange={(e) => setAmCapacity(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Duración máx. por reserva (min)
                <input type="number" min="15" required value={amDuration} onChange={(e) => setAmDuration(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Modo de uso
                <select value={amMode} onChange={(e) => setAmMode(e.target.value as AmenityDto['mode'])} style={inputStyle}>
                  <option value="SHARED">Compartida (por aforo)</option>
                  <option value="EXCLUSIVE">Exclusiva (1 unidad a la vez)</option>
                  <option value="FREE_USE">Uso libre (sin reserva)</option>
                </select>
              </label>
              <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                Política de anticipación
                <select value={amAdvance} onChange={(e) => setAmAdvance(e.target.value as AmenityDto['advancePolicy'])} style={inputStyle}>
                  <option value="SHORT_NOTICE_ALLOWED">Aviso corto (1 h)</option>
                  <option value="GENERAL">General (24 h)</option>
                </select>
              </label>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'grid', gap: '10px' }}>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={amHasSchedule} onChange={(e) => setAmHasSchedule(e.target.checked)} />
                Restringir horario de apertura/cierre
              </label>
              {amHasSchedule && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                    Apertura
                    <input type="time" value={amOpen} onChange={(e) => setAmOpen(e.target.value)} style={inputStyle} />
                  </label>
                  <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                    Cierre
                    <input type="time" value={amClose} onChange={(e) => setAmClose(e.target.value)} style={inputStyle} />
                  </label>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                  Límite de frecuencia
                  <select value={amFreqPeriod} onChange={(e) => setAmFreqPeriod(e.target.value as 'NONE' | 'DAY' | 'WEEK' | 'MONTH')} style={inputStyle}>
                    <option value="NONE">Sin límite</option>
                    <option value="DAY">Por día</option>
                    <option value="WEEK">Por semana</option>
                    <option value="MONTH">Por mes</option>
                  </select>
                </label>
                {amFreqPeriod !== 'NONE' && (
                  <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
                    Máx. reservas en el período
                    <input type="number" min="1" value={amFreqMax} onChange={(e) => setAmFreqMax(e.target.value)} style={inputStyle} />
                  </label>
                )}
              </div>
            </div>

            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Tarifa de limpieza (USD, 0 si es gratuita)
              <input type="number" step="0.01" min="0" value={amCleaningDollars} onChange={(e) => setAmCleaningDollars(e.target.value)} style={inputStyle} />
            </label>

            <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={amGuestQuota} onChange={(e) => setAmGuestQuota(e.target.checked)} />
                Aplica cupo de invitados por tipología (cobra invitado extra)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={amRequiresDeposit} onChange={(e) => setAmRequiresDeposit(e.target.checked)} />
                Requiere garantía vigente para reservar
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={amHasReader} onChange={(e) => setAmHasReader(e.target.checked)} />
                Tiene lector QR / control de acceso Hikvision
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" style={secondaryBtn} onClick={() => setAmenityDrawer('none')}>
                Cancelar
              </button>
              <button type="submit" disabled={busy} style={primaryBtn}>
                {busy ? 'Guardando...' : 'Guardar área'}
              </button>
            </div>
          </form>
        </div>
      )}

      {utDrawer !== 'none' && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <form
            onSubmit={handleSaveUnitType}
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: 'var(--color-surface)',
              padding: '24px',
              display: 'grid',
              gap: '14px',
              alignContent: 'start',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>
                {utDrawer === 'create' ? 'Nueva tipología' : `Editar ${utName}`}
              </h2>
              <button type="button" style={secondaryBtn} onClick={() => setUtDrawer('none')}>
                Cerrar
              </button>
            </div>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Código
              <input required disabled={utDrawer === 'edit'} value={utCode} onChange={(e) => setUtCode(e.target.value)} placeholder="PENTHOUSE" style={inputStyle} />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Nombre
              <input required value={utName} onChange={(e) => setUtName(e.target.value)} placeholder="Penthouse (4 dormitorios)" style={inputStyle} />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Número de dormitorios
              <input type="number" min="0" required value={utBedrooms} onChange={(e) => setUtBedrooms(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Invitados incluidos sin costo adicional
              <input type="number" min="0" required value={utGuests} onChange={(e) => setUtGuests(e.target.value)} style={inputStyle} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" style={secondaryBtn} onClick={() => setUtDrawer('none')}>
                Cancelar
              </button>
              <button type="submit" disabled={busy} style={primaryBtn}>
                {busy ? 'Guardando...' : 'Guardar tipología'}
              </button>
            </div>
          </form>
        </div>
      )}

      {comboDrawer && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <form
            onSubmit={handleCreateCombo}
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
              <h2 style={{ margin: 0, fontSize: '18px' }}>Nuevo combo de limpieza</h2>
              <button type="button" style={secondaryBtn} onClick={() => setComboDrawer(false)}>
                Cerrar
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Selecciona 2 o más áreas con tarifa de limpieza y define el precio especial combinado.
            </p>
            <div style={{ display: 'grid', gap: '8px' }}>
              {paidAmenities.map((a) => {
                const checked = comboAmenityIds.includes(a.id);
                return (
                  <label key={a.id} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setComboAmenityIds((prev) =>
                          checked ? prev.filter((id) => id !== a.id) : [...prev, a.id],
                        )
                      }
                    />
                    {a.name} (<Money cents={a.cleaningFeeCents} />)
                  </label>
                );
              })}
            </div>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              Tarifa total del combo (USD)
              <input type="number" step="0.01" min="1" required value={comboFeeDollars} onChange={(e) => setComboFeeDollars(e.target.value)} style={inputStyle} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" style={secondaryBtn} onClick={() => setComboDrawer(false)}>
                Cancelar
              </button>
              <button type="submit" disabled={busy || comboAmenityIds.length < 2} style={primaryBtn}>
                {busy ? 'Guardando...' : 'Crear combo'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
