'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Money } from '@noah/ui';
import { DomainTag, HabitatDrawer, HabitatTabs, HabitatToast, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { getAmenityModeMeta } from '../../../lib/labels';
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

const PERIOD_LABELS: Record<'DAY' | 'WEEK' | 'MONTH', string> = {
  DAY: 'día',
  WEEK: 'semana',
  MONTH: 'mes',
};

type TabKey = 'settings' | 'amenities' | 'matrix' | 'unitTypes' | 'combos' | 'parking';

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
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  // No business defaults: every field stays empty until the building's configuration is loaded.
  const [feePerSqm, setFeePerSqm] = useState('');
  const [depositDollars, setDepositDollars] = useState('');
  const [arrearsTolerance, setArrearsTolerance] = useState('');
  const [extraDeclared, setExtraDeclared] = useState('');
  const [extraUndeclared, setExtraUndeclared] = useState('');
  const [proofDeadline, setProofDeadline] = useState('');
  const [entryMargin, setEntryMargin] = useState('');
  const [generalAdvance, setGeneralAdvance] = useState('');
  const [shortNotice, setShortNotice] = useState('');
  const [weekStart, setWeekStart] = useState('MONDAY');
  const [feeDueDay, setFeeDueDay] = useState('');
  const [cancelMinHours, setCancelMinHours] = useState('');
  const [cancelCleaning, setCancelCleaning] = useState<'NON_REFUNDABLE' | 'REFUNDABLE' | 'CREDIT'>('NON_REFUNDABLE');

  const [parkingSpots, setParkingSpots] = useState('');
  const [parkingFreeMins, setParkingFreeMins] = useState('');
  const [parkingOvertimeDollars, setParkingOvertimeDollars] = useState('');
  const [parkingRounding, setParkingRounding] = useState('CEIL_HOUR');
  const [parkingAlertMargin, setParkingAlertMargin] = useState('');

  const [amenityDrawer, setAmenityDrawer] = useState<'none' | 'create' | 'edit'>('none');
  const [amCode, setAmCode] = useState('');
  const [amName, setAmName] = useState('');
  const [amCapacity, setAmCapacity] = useState('');
  const [amDuration, setAmDuration] = useState('');
  const [amMode, setAmMode] = useState<AmenityDto['mode']>('SHARED');
  const [amAdvance, setAmAdvance] = useState<AmenityDto['advancePolicy']>('SHORT_NOTICE_ALLOWED');
  const [amHasSchedule, setAmHasSchedule] = useState(true);
  const [amOpen, setAmOpen] = useState('08:00');
  const [amClose, setAmClose] = useState('22:00');
  const [amFreqPeriod, setAmFreqPeriod] = useState<'NONE' | 'DAY' | 'WEEK' | 'MONTH'>('WEEK');
  const [amFreqMax, setAmFreqMax] = useState('');
  const [amGuestQuota, setAmGuestQuota] = useState(true);
  const [amRequiresDeposit, setAmRequiresDeposit] = useState(false);
  const [amCleaningDollars, setAmCleaningDollars] = useState('0.00');
  const [amHasReader, setAmHasReader] = useState(true);

  const [utDrawer, setUtDrawer] = useState<'none' | 'create' | 'edit'>('none');
  const [utCode, setUtCode] = useState('');
  const [utName, setUtName] = useState('');
  const [utBedrooms, setUtBedrooms] = useState('');
  const [utGuests, setUtGuests] = useState('');

  const [comboDrawer, setComboDrawer] = useState(false);
  const [comboAmenityIds, setComboAmenityIds] = useState<string[]>([]);
  const [comboFeeDollars, setComboFeeDollars] = useState('');

  const canEdit = me.role === 'SUPERADMIN' || me.role === 'ADMIN';
  const ready = loadState === 'ready';

  const applySettings = useCallback((s: TenantSettingsDto | null) => {
    setSettings(s);
    setFeePerSqm(s ? centsToDollars(s.monthlyFeePerSqmCents ?? 0) : '');
    setDepositDollars(s ? centsToDollars(s.depositRequiredCents) : '');
    setArrearsTolerance(s ? String(s.arrearsToleranceMonths) : '');
    setExtraDeclared(s ? centsToDollars(s.extraGuestDeclaredCents) : '');
    setExtraUndeclared(s ? centsToDollars(s.extraGuestUndeclaredCents) : '');
    setProofDeadline(s ? String(s.paymentProofDeadlineMinutes) : '');
    setEntryMargin(s ? String(s.entryMarginMinutes) : '');
    setGeneralAdvance(s ? String(s.generalAdvanceHours) : '');
    setShortNotice(s ? String(s.shortNoticeAdvanceMinutes) : '');
    setWeekStart(s?.frequencyWeekStart || 'MONDAY');
    setFeeDueDay(s?.monthlyFeeDueDay !== undefined ? String(s.monthlyFeeDueDay) : '');
    setCancelMinHours(
      s?.cancellationPolicy?.minHoursBefore !== undefined ? String(s.cancellationPolicy.minHoursBefore) : '',
    );
    setCancelCleaning(s?.cancellationPolicy?.cleaningFeeHandling ?? 'NON_REFUNDABLE');
  }, []);

  const applyParking = useCallback((pk: ParkingConfigDto | null) => {
    setParking(pk);
    setParkingSpots(pk ? String(pk.spots) : '');
    setParkingFreeMins(pk ? String(pk.freeMinutes) : '');
    setParkingOvertimeDollars(pk ? centsToDollars(pk.overtimeFeeCentsPerHour) : '');
    setParkingRounding(pk?.rounding || 'CEIL_HOUR');
    setParkingAlertMargin(pk?.alertMarginMinutes !== undefined ? String(pk.alertMarginMinutes) : '');
  }, []);

  /** Reloads only the catalog lists (keeps unsaved edits in the settings/parking forms). */
  const reloadLists = useCallback(async () => {
    if (!tenantId) return;
    const [ut, am, cb] = await Promise.all([
      catalogApi.listUnitTypes(token, tenantId),
      catalogApi.listAmenities(token, tenantId),
      catalogApi.listCombos(token, tenantId),
    ]);
    setUnitTypes(ut);
    setAmenities(am);
    setCombos(cb);
  }, [token, tenantId]);

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoadState('loading');
    setLoadError(null);
    try {
      const [s, pk] = await Promise.all([
        catalogApi.getSettings(token, tenantId),
        catalogApi.getParking(token, tenantId),
        reloadLists(),
      ]);
      applySettings(s);
      applyParking(pk);
      setLoadState('ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la configuración del edificio.');
      setLoadState('error');
    }
  }, [token, tenantId, reloadLists, applySettings, applyParking]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !canEdit || !ready) return;
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await catalogApi.saveSettings(token, tenantId, {
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
        monthlyFeeDueDay: Number(feeDueDay),
        cancellationPolicy:
          cancelMinHours === ''
            ? null
            : {
                minHoursBefore: Number(cancelMinHours),
                cleaningFeeHandling: cancelCleaning,
              },
      });
      applySettings(saved);
      setFeedback({ type: 'ok', text: 'Parámetros del edificio guardados y registrados en auditoría.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar parámetros.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveParking(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || !canEdit || !ready) return;
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await catalogApi.saveParking(token, tenantId, {
        spots: Number(parkingSpots),
        freeMinutes: Number(parkingFreeMins),
        overtimeFeeCentsPerHour: dollarsToCents(parkingOvertimeDollars),
        rounding: parkingRounding,
        ...(parkingAlertMargin !== '' ? { alertMarginMinutes: Number(parkingAlertMargin) } : {}),
      });
      applyParking(saved);
      setFeedback({ type: 'ok', text: 'Configuración de parqueaderos actualizada.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al guardar parqueaderos.' });
    } finally {
      setBusy(false);
    }
  }

  function openCreateAmenity() {
    setAmCode('');
    setAmName('');
    setAmCapacity('');
    setAmDuration('');
    setAmMode('SHARED');
    setAmAdvance('SHORT_NOTICE_ALLOWED');
    setAmHasSchedule(true);
    setAmOpen('');
    setAmClose('');
    setAmFreqPeriod('NONE');
    setAmFreqMax('');
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
    setAmOpen(sched?.open ?? '');
    setAmClose(sched?.close ?? '');
    setAmFreqPeriod(a.frequency ? a.frequency.period : 'NONE');
    setAmFreqMax(a.frequency ? String(a.frequency.max) : '');
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
      await reloadLists();
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
      await reloadLists();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'No se pudo eliminar el área.' });
    }
  }

  function openCreateUnitType() {
    setUtCode('');
    setUtName('');
    setUtBedrooms('');
    setUtGuests('');
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
      await reloadLists();
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
      await reloadLists();
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
      await reloadLists();
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
      await reloadLists();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error al eliminar combo.' });
    }
  }

  async function toggleAccess(
    amenityId: string,
    occupancyRole: AccessRuleDto['occupancyRole'],
    currentAllowed: boolean,
  ) {
    if (!tenantId || !canEdit || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await catalogApi.setAccessRule(token, tenantId, {
        amenityId,
        occupancyRole,
        allowed: !currentAllowed,
      });
      setFeedback({ type: 'ok', text: 'Matriz de acceso actualizada y registrada en auditoría.' });
      await reloadLists();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'No se pudo actualizar la matriz.' });
    } finally {
      setBusy(false);
    }
  }

  const amenityNameById = new Map(amenities.map((a) => [a.id, a.name]));
  const paidAmenities = amenities.filter((a) => a.cleaningFeeCents > 0);

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="REGLAMENTO PARAMETRIZABLE"
        title="Configurador del edificio"
        description="Define alícuota por m², áreas comunales, matriz de acceso por rol, tipologías, combos de limpieza y parqueaderos."
        icon={SlidersHorizontal}
        actions={
          canEdit &&
          (tab === 'amenities' ? (
            <button type="button" className="h-btn-dark" onClick={openCreateAmenity}>
              <Plus size={15} /> Nueva área comunal
            </button>
          ) : tab === 'unitTypes' ? (
            <button type="button" className="h-btn-dark" onClick={openCreateUnitType}>
              <Plus size={15} /> Nueva tipología
            </button>
          ) : tab === 'combos' ? (
            <button type="button" className="h-btn-dark" onClick={() => setComboDrawer(true)}>
              <Plus size={15} /> Nuevo combo
            </button>
          ) : null)
        }
      />

      <HabitatTabs
        active={tab}
        onChange={setTab}
        items={[
          { key: 'settings', label: 'Parámetros y Alícuota' },
          { key: 'amenities', label: `Áreas comunales (${amenities.length})` },
          { key: 'matrix', label: 'Matriz de acceso' },
          { key: 'unitTypes', label: `Tipologías (${unitTypes.length})` },
          { key: 'combos', label: `Combos (${combos.length})` },
          { key: 'parking', label: 'Parqueaderos' },
        ]}
      />

      {feedback && (
        <HabitatToast type={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} />
      )}

      {loadState === 'loading' && (
        <div className="h-panel" style={{ color: 'var(--muted-foreground)', fontSize: '13.5px' }}>
          Cargando configuración del edificio…
        </div>
      )}

      {loadState === 'error' && (
        <div className="h-notice h-notice-err" role="alert">
          <span>{loadError ?? 'No se pudo cargar la configuración del edificio.'}</span>
          <button type="button" className="h-btn-outline" onClick={() => void loadAll()}>
            Reintentar
          </button>
        </div>
      )}

      {ready && tab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="h-panel" style={{ display: 'grid', gap: '18px' }}>
          {!settings && (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>
              Este edificio aún no tiene parámetros registrados. Completa todos los campos y guarda.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <label className="h-field">
              Costo de alícuota por m² (USD / m²)
              <input type="number" step="0.01" min="0" required disabled={!canEdit} value={feePerSqm} onChange={(e) => setFeePerSqm(e.target.value)} className="h-input" />
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 400 }}>
                Calcula automáticamente la alícuota mensual de cada unidad según su metraje.
              </span>
            </label>
            <label className="h-field">
              Garantía requerida (USD)
              <input type="number" step="0.01" min="0" required disabled={!canEdit} value={depositDollars} onChange={(e) => setDepositDollars(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Tolerancia de mora (meses impagos)
              <input type="number" min="0" required disabled={!canEdit} value={arrearsTolerance} onChange={(e) => setArrearsTolerance(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Invitado extra declarado (USD)
              <input type="number" step="0.01" min="0" required disabled={!canEdit} value={extraDeclared} onChange={(e) => setExtraDeclared(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Invitado extra no declarado / multa (USD)
              <input type="number" step="0.01" min="0" required disabled={!canEdit} value={extraUndeclared} onChange={(e) => setExtraUndeclared(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Plazo envío comprobante limpieza (min)
              <input type="number" min="1" required disabled={!canEdit} value={proofDeadline} onChange={(e) => setProofDeadline(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Margen de entrada QR antes del inicio (min)
              <input type="number" min="0" required disabled={!canEdit} value={entryMargin} onChange={(e) => setEntryMargin(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Anticipación general de reserva (horas)
              <input type="number" min="0" required disabled={!canEdit} value={generalAdvance} onChange={(e) => setGeneralAdvance(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Anticipación aviso corto áreas compartidas (min)
              <input type="number" min="0" required disabled={!canEdit} value={shortNotice} onChange={(e) => setShortNotice(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Inicio de semana para frecuencias
              <SearchableSelect
                disabled={!canEdit}
                value={weekStart}
                onChange={setWeekStart}
                searchPlaceholder="Buscar día..."
                options={[
                  { value: 'MONDAY', label: 'Lunes' },
                  { value: 'SUNDAY', label: 'Domingo' },
                ]}
              />
            </label>
            <label className="h-field">
              Día de vencimiento de la alícuota (1–31)
              <input type="number" min="1" max="31" required disabled={!canEdit} value={feeDueDay} onChange={(e) => setFeeDueDay(e.target.value)} className="h-input" />
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 400 }}>
                Si el mes tiene menos días, vence el último día del mes (23:59 hora del edificio).
              </span>
            </label>
            <label className="h-field">
              Cancelación sin penalidad (horas antes)
              <input type="number" min="0" disabled={!canEdit} value={cancelMinHours} onChange={(e) => setCancelMinHours(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Tarifa de limpieza al cancelar
              <SearchableSelect
                disabled={!canEdit}
                value={cancelCleaning}
                onChange={(val) => setCancelCleaning(val as 'NON_REFUNDABLE' | 'REFUNDABLE' | 'CREDIT')}
                searchPlaceholder="Buscar política..."
                options={[
                  { value: 'NON_REFUNDABLE', label: 'No reembolsable' },
                  { value: 'CREDIT', label: 'Crédito a favor' },
                  { value: 'REFUNDABLE', label: 'Reembolsable' },
                ]}
              />
            </label>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={busy || !ready} className="h-btn-dark">
                {busy ? 'Guardando...' : 'Guardar parámetros'}
              </button>
            </div>
          )}
        </form>
      )}

      {ready && tab === 'amenities' && (
        <div className="h-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Área</th>
                <th>Aforo</th>
                <th>Duración</th>
                <th>Horario</th>
                <th>Frecuencia</th>
                <th>Modo</th>
                <th>Limpieza</th>
                {canEdit && <th style={{ textAlign: 'right' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {amenities.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                      {a.code} {a.appliesGuestQuota ? '· Cupos' : ''} {a.requiresDeposit ? '· Garantía' : ''} {a.hasReader ? '· QR' : ''}
                    </div>
                  </td>
                  <td>{a.capacity} pers.</td>
                  <td>{a.maxDurationMinutes / 60} h</td>
                  <td>{a.schedule?.all ? `${a.schedule.all.open}–${a.schedule.all.close}` : 'Sin límite'}</td>
                  <td>{a.frequency ? `${a.frequency.max}/${PERIOD_LABELS[a.frequency.period]}` : 'Libre'}</td>
                  <td>
                    {(() => {
                      const modeMeta = getAmenityModeMeta(a.mode);
                      return (
                        <DomainTag
                          label={modeMeta.label}
                          bg={modeMeta.bg}
                          color={modeMeta.color}
                          border={modeMeta.border}
                        />
                      );
                    })()}
                  </td>
                  <td>{a.cleaningFeeCents > 0 ? <Money cents={a.cleaningFeeCents} /> : '—'}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="h-btn-outline h-btn-sm" style={{ marginRight: '6px' }} onClick={() => openEditAmenity(a)}>
                        <Pencil size={12} /> Editar
                      </button>
                      <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleDeleteAmenity(a)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ready && tab === 'matrix' && (
        <div className="h-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Área</th>
                {ROLES.map((r) => (
                  <th key={r.key} style={{ textAlign: 'center' }}>
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {amenities.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  {ROLES.map((r) => {
                    const rule = a.accessRules.find((ar) => ar.occupancyRole === r.key);
                    const allowed = rule?.allowed ?? false;
                    return (
                      <td key={r.key} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={allowed}
                          disabled={!canEdit || busy}
                          onChange={() => void toggleAccess(a.id, r.key, allowed)}
                          aria-label={`${a.name} - ${r.label}`}
                          style={{ width: '16px', height: '16px', accentColor: '#28251f', cursor: canEdit ? 'pointer' : 'default' }}
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

      {ready && tab === 'unitTypes' && (
        <div className="h-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipología</th>
                <th>Dormitorios</th>
                <th>Invitados incluidos</th>
                {canEdit && <th style={{ textAlign: 'right' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {unitTypes.map((ut) => (
                <tr key={ut.id}>
                  <td style={{ fontFamily: 'monospace' }}>{ut.code}</td>
                  <td style={{ fontWeight: 600 }}>{ut.name}</td>
                  <td>{ut.bedrooms ?? 1}</td>
                  <td>1 residente + {ut.includedGuests} invitados</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="h-btn-outline h-btn-sm" style={{ marginRight: '6px' }} onClick={() => openEditUnitType(ut)}>
                        <Pencil size={12} /> Editar
                      </button>
                      <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleDeleteUnitType(ut)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ready && tab === 'combos' && (
        <div style={{ display: 'grid', gap: '10px' }}>
          {combos.map((c) => (
            <div key={c.id} className="h-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
              <span style={{ fontWeight: 500 }}>{c.amenityIds.map((id) => amenityNameById.get(id) ?? id).join(' + ')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <strong style={{ fontSize: '16px' }}>
                  <Money cents={c.feeCents} />
                </strong>
                {canEdit && (
                  <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleDeleteCombo(c.id)}>
                    <Trash2 size={12} /> Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {ready && tab === 'parking' && (
        <form onSubmit={handleSaveParking} className="h-panel" style={{ display: 'grid', gap: '16px', maxWidth: '640px' }}>
          {!parking && (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>
              Este edificio aún no tiene parqueaderos de visitas configurados. Completa los campos y guarda.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <label className="h-field">
              Puestos de parqueo de visitas
              <input type="number" min="0" required disabled={!canEdit} value={parkingSpots} onChange={(e) => setParkingSpots(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Tiempo gratuito (minutos)
              <input type="number" min="0" required disabled={!canEdit} value={parkingFreeMins} onChange={(e) => setParkingFreeMins(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Tarifa por exceso (USD / hora)
              <input type="number" step="0.01" min="0" required disabled={!canEdit} value={parkingOvertimeDollars} onChange={(e) => setParkingOvertimeDollars(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Alerta en garita antes de terminar el tiempo gratuito (min)
              <input type="number" min="0" required disabled={!canEdit} value={parkingAlertMargin} onChange={(e) => setParkingAlertMargin(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Redondeo de exceso
              <SearchableSelect
                disabled={!canEdit}
                value={parkingRounding}
                onChange={setParkingRounding}
                searchPlaceholder="Buscar redondeo..."
                options={[
                  { value: 'CEIL_HOUR', label: 'Hora o fracción (hacia arriba)' },
                  { value: 'EXACT_MINUTE', label: 'Proporcional por minuto' },
                ]}
              />
            </label>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={busy || !ready} className="h-btn-dark">
                {busy ? 'Guardando...' : 'Guardar parqueaderos'}
              </button>
            </div>
          )}
        </form>
      )}

      <HabitatDrawer
        open={amenityDrawer !== 'none'}
        title={amenityDrawer === 'create' ? 'Nueva área comunal' : `Editar ${amName}`}
        subtitle="Define aforo, horarios, frecuencia, tarifa de limpieza y control de acceso."
        onClose={() => setAmenityDrawer('none')}
        width={520}
      >
        <form onSubmit={handleSaveAmenity} style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label className="h-field">
              Código único
              <input required disabled={amenityDrawer === 'edit'} value={amCode} onChange={(e) => setAmCode(e.target.value)} placeholder="AREA_COMUNAL" className="h-input" />
            </label>
            <label className="h-field">
              Nombre del área
              <input required value={amName} onChange={(e) => setAmName(e.target.value)} placeholder="Salón comunal" className="h-input" />
            </label>
            <label className="h-field">
              Aforo máximo (personas)
              <input type="number" min="1" required value={amCapacity} onChange={(e) => setAmCapacity(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Duración máx. (min)
              <input type="number" min="15" required value={amDuration} onChange={(e) => setAmDuration(e.target.value)} className="h-input" />
            </label>
            <label className="h-field">
              Modo de uso
              <SearchableSelect
                value={amMode}
                onChange={(val) => setAmMode(val as AmenityDto['mode'])}
                searchPlaceholder="Buscar modo..."
                options={[
                  { value: 'SHARED', label: 'Compartida (por aforo)' },
                  { value: 'EXCLUSIVE', label: 'Exclusiva (1 unidad a la vez)' },
                  { value: 'FREE_USE', label: 'Uso libre (sin reserva)' },
                ]}
              />
            </label>
            <label className="h-field">
              Política de anticipación
              <SearchableSelect
                value={amAdvance}
                onChange={(val) => setAmAdvance(val as AmenityDto['advancePolicy'])}
                searchPlaceholder="Buscar política..."
                options={[
                  { value: 'SHORT_NOTICE_ALLOWED', label: 'Aviso corto (1 h)' },
                  { value: 'GENERAL', label: 'General (24 h)' },
                ]}
              />
            </label>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'grid', gap: '10px' }}>
            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={amHasSchedule} onChange={(e) => setAmHasSchedule(e.target.checked)} />
              Restringir horario de apertura/cierre
            </label>
            {amHasSchedule && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="h-field">
                  Apertura
                  <input type="time" required value={amOpen} onChange={(e) => setAmOpen(e.target.value)} className="h-input" />
                </label>
                <label className="h-field">
                  Cierre
                  <input type="time" required value={amClose} onChange={(e) => setAmClose(e.target.value)} className="h-input" />
                </label>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="h-field">
                Límite de frecuencia
                <SearchableSelect
                  value={amFreqPeriod}
                  onChange={(val) => setAmFreqPeriod(val as 'NONE' | 'DAY' | 'WEEK' | 'MONTH')}
                  searchPlaceholder="Buscar límite..."
                  options={[
                    { value: 'NONE', label: 'Sin límite' },
                    { value: 'DAY', label: 'Por día' },
                    { value: 'WEEK', label: 'Por semana' },
                    { value: 'MONTH', label: 'Por mes' },
                  ]}
                />
              </label>
              {amFreqPeriod !== 'NONE' && (
                <label className="h-field">
                  Máx. reservas
                  <input type="number" min="1" required value={amFreqMax} onChange={(e) => setAmFreqMax(e.target.value)} className="h-input" />
                </label>
              )}
            </div>
          </div>

          <label className="h-field">
            Tarifa de limpieza (USD, 0 si es gratuita)
            <input type="number" step="0.01" min="0" value={amCleaningDollars} onChange={(e) => setAmCleaningDollars(e.target.value)} className="h-input" />
          </label>

          <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={amGuestQuota} onChange={(e) => setAmGuestQuota(e.target.checked)} />
              Aplica cupo de invitados por tipología
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

          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setAmenityDrawer('none')}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="h-btn-dark">
              {busy ? 'Guardando...' : 'Guardar área'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <HabitatDrawer
        open={utDrawer !== 'none'}
        title={utDrawer === 'create' ? 'Nueva tipología' : `Editar ${utName}`}
        subtitle="Define el número de dormitorios y el cupo de invitados incluidos."
        onClose={() => setUtDrawer('none')}
        width={430}
      >
        <form onSubmit={handleSaveUnitType} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Código
            <input required disabled={utDrawer === 'edit'} value={utCode} onChange={(e) => setUtCode(e.target.value)} placeholder="TIPO_UNIDAD" className="h-input" />
          </label>
          <label className="h-field">
            Nombre
            <input required value={utName} onChange={(e) => setUtName(e.target.value)} placeholder="Departamento (2 dormitorios)" className="h-input" />
          </label>
          <label className="h-field">
            Número de dormitorios
            <input type="number" min="0" required value={utBedrooms} onChange={(e) => setUtBedrooms(e.target.value)} className="h-input" />
          </label>
          <label className="h-field">
            Invitados incluidos sin costo adicional
            <input type="number" min="0" required value={utGuests} onChange={(e) => setUtGuests(e.target.value)} className="h-input" />
          </label>
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setUtDrawer('none')}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="h-btn-dark">
              {busy ? 'Guardando...' : 'Guardar tipología'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <HabitatDrawer
        open={comboDrawer}
        title="Nuevo combo de limpieza"
        subtitle="Selecciona 2 o más áreas con tarifa de limpieza y define el precio combinado."
        onClose={() => setComboDrawer(false)}
        width={440}
      >
        <form onSubmit={handleCreateCombo} style={{ display: 'grid', gap: '14px' }}>
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
          <label className="h-field">
            Tarifa total del combo (USD)
            <input type="number" step="0.01" min="1" required value={comboFeeDollars} onChange={(e) => setComboFeeDollars(e.target.value)} className="h-input" />
          </label>
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setComboDrawer(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={busy || comboAmenityIds.length < 2} className="h-btn-dark">
              {busy ? 'Guardando...' : 'Crear combo'}
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
