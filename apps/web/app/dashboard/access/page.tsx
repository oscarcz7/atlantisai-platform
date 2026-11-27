'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Copy, DoorOpen, KeyRound, Plus, QrCode, Radio, RefreshCw, Trash2 } from 'lucide-react';
import { StatusBadge } from '@noah/ui';
import { DomainTag, HabitatDrawer, HabitatToast, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { useDashboard } from '../../../lib/dashboard-context';
import { getGatewayCommandMeta, READER_STATUS_LABELS } from '../../../lib/labels';
import { formatDateTimeInZone } from '../../../lib/zoned-time';

const OPEN_DOOR_REASON_MAX = 500;

interface ReaderRow {
  id: string;
  code: string;
  name: string;
  serial: string | null;
  model: string;
  protocol: string;
  ip: string;
  port: number;
  doorNo: number;
  firmware: string | null;
  amenityIds: string[];
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastSeenAt: string | null;
}

interface AmenityOption {
  id: string;
  code: string;
  name: string;
}

interface CommandRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  ackedAt: string | null;
  reader?: { code: string; name: string; ip: string } | null;
  credential?: { employeeNo: string; code: string; syncStatus: string } | null;
}

interface EventRow {
  id: string;
  employeeNo: string | null;
  credentialCode: string | null;
  result: 'GRANTED' | 'DENIED';
  occurredAt: string;
  reader?: { code: string; name: string } | null;
}

export default function AccessControlPage() {
  const { me, tenantId, tenantTimezone, apiFetch } = useDashboard();
  const [readers, setReaders] = useState<ReaderRow[]>([]);
  const [amenities, setAmenities] = useState<AmenityOption[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [port, setPort] = useState('80');
  const [doorNo, setDoorNo] = useState('1');
  const [serial, setSerial] = useState('');
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Remote opening: confirmation with a mandatory reason (audited by the API).
  const [openTarget, setOpenTarget] = useState<ReaderRow | null>(null);
  const [openReason, setOpenReason] = useState('');
  const [openBusy, setOpenBusy] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // Gateway token rotation: confirm first, then show the plaintext token once.
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [rotateBusy, setRotateBusy] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotatedToken, setRotatedToken] = useState<{ token: string; rotatedAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const canManage = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [r, a, c, e] = await Promise.all([
        apiFetch<ReaderRow[]>('/access/readers'),
        apiFetch<AmenityOption[]>('/catalog/amenities'),
        apiFetch<CommandRow[]>('/access/commands?limit=30'),
        apiFetch<EventRow[]>('/access/events?limit=30'),
      ]);
      setReaders(r);
      setAmenities(a);
      setCommands(c);
      setEvents(e);
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No se pudo cargar el control de acceso.');
    }
  }, [apiFetch, tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openNew() {
    setEditingId(undefined);
    setCode('');
    setName('');
    setIp('');
    setProtocol('http');
    setPort('80');
    setDoorNo('1');
    setSerial('');
    setSelectedAmenityIds([]);
    setError(null);
    setDrawerOpen(true);
  }

  function openEdit(r: ReaderRow) {
    setEditingId(r.id);
    setCode(r.code);
    setName(r.name);
    setIp(r.ip);
    setProtocol(r.protocol === 'https' ? 'https' : 'http');
    setPort(String(r.port));
    setDoorNo(String(r.doorNo));
    setSerial(r.serial ?? '');
    setSelectedAmenityIds(r.amenityIds);
    setError(null);
    setDrawerOpen(true);
  }

  function toggleAmenity(id: string) {
    setSelectedAmenityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/access/readers', {
        method: 'POST',
        body: {
          id: editingId,
          code,
          name,
          ip,
          protocol,
          port: Number(port) || (protocol === 'https' ? 443 : 80),
          doorNo: Number(doorNo) || 1,
          serial: serial || undefined,
          amenityIds: selectedAmenityIds,
        },
      });
      setDrawerOpen(false);
      setToast('Lector Hikvision guardado correctamente.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el lector.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar este lector de la configuración?')) return;
    try {
      await apiFetch(`/access/readers/${id}`, { method: 'DELETE' });
      setToast('Lector eliminado.');
      await loadData();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No se pudo eliminar el lector.');
    }
  }

  function askOpenDoor(reader: ReaderRow) {
    setOpenTarget(reader);
    setOpenReason('');
    setOpenError(null);
  }

  async function handleOpenDoor(e: FormEvent) {
    e.preventDefault();
    if (!openTarget) return;
    const reason = openReason.trim();
    if (!reason) {
      setOpenError('Indica el motivo de la apertura remota.');
      return;
    }
    setOpenBusy(true);
    setOpenError(null);
    try {
      await apiFetch(`/access/readers/${openTarget.id}/open`, { method: 'POST', body: { reason } });
      setToast(`Orden de apertura remota encolada para ${openTarget.name}.`);
      setOpenTarget(null);
      setOpenReason('');
      await loadData();
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'No se pudo encolar la apertura remota.');
    } finally {
      setOpenBusy(false);
    }
  }

  async function handleRotateToken() {
    setRotateBusy(true);
    setRotateError(null);
    try {
      const res = await apiFetch<{ token: string; rotatedAt: string }>('/access/gateway/token/rotate', {
        method: 'POST',
      });
      setRotateConfirmOpen(false);
      setCopied(false);
      setRotatedToken(res);
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : 'No se pudo rotar el token del gateway.');
    } finally {
      setRotateBusy(false);
    }
  }

  async function copyToken() {
    if (!rotatedToken) return;
    try {
      await navigator.clipboard.writeText(rotatedToken.token);
      setCopied(true);
    } catch {
      setCopied(false);
      setRotateError('No se pudo copiar automáticamente. Selecciona el token y cópialo manualmente.');
    }
  }

  function closeTokenModal() {
    if (!window.confirm('El token no se volverá a mostrar. ¿Ya lo copiaste y actualizaste el gateway?')) return;
    setRotatedToken(null);
    setCopied(false);
    setRotateError(null);
  }

  const amenityNameById = new Map(amenities.map((a) => [a.id, a.name]));

  return (
    <section className="internal-page">
      <ModuleHero
        eyebrow="CONTROL DE ACCESO HIKVISION"
        title="Lectores QR y cola Edge Gateway"
        description="Registra las IPs de los lectores DS-K1T344EBFWX-E1, monitorea comandos ISAPI (altas/revocaciones QR) y revisa lecturas en vivo."
        icon={QrCode}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="h-btn-outline" onClick={() => void loadData()}>
              <RefreshCw size={14} /> Actualizar
            </button>
            {canManage && (
              <button
                type="button"
                className="h-btn-outline"
                onClick={() => {
                  setRotateError(null);
                  setRotateConfirmOpen(true);
                }}
              >
                <KeyRound size={14} /> Rotar token del gateway
              </button>
            )}
            {canManage && (
              <button type="button" className="h-btn-dark" onClick={openNew}>
                <Plus size={15} /> Nuevo lector
              </button>
            )}
          </div>
        }
      />

      {toast && <HabitatToast type="ok" text={toast} onClose={() => setToast(null)} />}
      {pageError && <HabitatToast type="err" text={pageError} onClose={() => setPageError(null)} />}

      <div className="h-kpi-strip">
        <article className="h-kpi-card">
          <span>Lectores registrados</span>
          <strong>{String(readers.length).padStart(2, '0')}</strong>
          <small>{readers.filter((r) => r.status === 'ONLINE').length} en línea</small>
        </article>
        <article className="h-kpi-card">
          <span>Comandos en cola</span>
          <strong>{commands.filter((c) => c.status === 'PENDING' || c.status === 'PROCESSING').length}</strong>
          <small>{commands.filter((c) => c.status === 'ACKED').length} confirmados</small>
        </article>
        <article className="h-kpi-card">
          <span>Eventos recibidos</span>
          <strong>{events.length}</strong>
          <small>últimas lecturas QR</small>
        </article>
      </div>

      {/* Readers Table */}
      <div className="h-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código / Nombre</th>
              <th>Dirección ISAPI</th>
              <th>Áreas vinculadas</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {readers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted-foreground)', padding: '24px' }}>
                  No hay lectores registrados todavía. Agrega uno aquí (o un lector de prueba para probar con FakeDevice).
                </td>
              </tr>
            ) : (
              readers.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                      {r.code} · {r.model} {r.firmware ? `· FW ${r.firmware}` : ''}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12.5px' }}>
                    {r.protocol}://{r.ip}:{r.port} (puerta {r.doorNo})
                  </td>
                  <td style={{ fontSize: '12.5px' }}>
                    {r.amenityIds.length === 0
                      ? 'Sin áreas'
                      : r.amenityIds.map((id) => amenityNameById.get(id) ?? id.slice(0, 6)).join(', ')}
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 9px',
                        borderRadius: '999px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        background: r.status === 'ONLINE' ? '#e8f5ee' : r.status === 'OFFLINE' ? '#fee2e2' : '#f1f5f9',
                        color: r.status === 'ONLINE' ? '#1f7a53' : r.status === 'OFFLINE' ? '#991b1b' : '#475569',
                      }}
                    >
                      <Radio size={11} /> {READER_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="h-btn-outline h-btn-sm"
                        onClick={() => askOpenDoor(r)}
                        title="Encolar apertura remota"
                      >
                        <DoorOpen size={13} /> Abrir
                      </button>
                      {canManage && (
                        <>
                          <button type="button" className="h-btn-outline h-btn-sm" onClick={() => openEdit(r)}>
                            Editar
                          </button>
                          <button type="button" className="h-btn-danger h-btn-sm" onClick={() => void handleDelete(r.id)}>
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Gateway Commands Queue */}
      <div className="h-table-wrap" style={{ marginTop: '16px' }}>
        <table>
          <thead>
            <tr>
              <th>Comando Gateway</th>
              <th>Lector</th>
              <th>Credencial QR</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {commands.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted-foreground)', padding: '20px' }}>
                  Sin comandos encolados todavía. Confirma una reserva en un área con lector vinculado para ver el alta aquí.
                </td>
              </tr>
            ) : (
              commands.map((c) => {
                const cmdMeta = getGatewayCommandMeta(c.type);
                return (
                  <tr key={c.id}>
                    <td>
                      <DomainTag label={cmdMeta.label} bg={cmdMeta.bg} color={cmdMeta.color} title={c.type} />
                    </td>
                    <td style={{ fontSize: '12.5px' }}>
                      {c.reader ? `${c.reader.name} (${c.reader.ip})` : '—'}
                    </td>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12.5px' }}>
                      {c.credential ? `${c.credential.employeeNo} · ${c.credential.code}` : '—'}
                    </td>
                    <td style={{ fontSize: '12.5px' }}>
                      <StatusBadge status={c.status} />
                      {c.lastError ? <div style={{ color: '#b91c1c', fontSize: '11.5px', marginTop: '4px' }}>{c.lastError}</div> : null}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                      {formatDateTimeInZone(c.createdAt, tenantTimezone)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <HabitatDrawer
        open={drawerOpen}
        title={editingId ? 'Editar lector Hikvision' : 'Nuevo lector Hikvision'}
        subtitle="Configura IP local, protocolo ISAPI y qué áreas comunales abre este lector."
        onClose={() => setDrawerOpen(false)}
        width={480}
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label className="h-field">
              Código
              <input className="h-input" required placeholder="READER_GYM" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <label className="h-field">
              Nombre
              <input className="h-input" required placeholder="Lector Gimnasio" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.4fr 0.7fr 0.7fr', gap: '8px' }}>
            <label className="h-field">
              Protocolo
              <SearchableSelect
                value={protocol}
                onChange={(val) => {
                  const p = val === 'https' ? 'https' : 'http';
                  setProtocol(p);
                  setPort(p === 'https' ? '443' : '80');
                }}
                searchPlaceholder="Protocolo..."
                options={[
                  { value: 'http', label: 'HTTP' },
                  { value: 'https', label: 'HTTPS' },
                ]}
              />
            </label>
            <label className="h-field">
              IP Local
              <input className="h-input" required placeholder="192.168.1.64" value={ip} onChange={(e) => setIp(e.target.value)} />
            </label>
            <label className="h-field">
              Puerto
              <input className="h-input" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
            <label className="h-field">
              Puerta
              <input className="h-input" type="number" min={1} value={doorNo} onChange={(e) => setDoorNo(e.target.value)} />
            </label>
          </div>

          <label className="h-field">
            Serie (opcional)
            <input className="h-input" placeholder="DS-K1T344..." value={serial} onChange={(e) => setSerial(e.target.value)} />
          </label>

          <div className="h-field">
            <span>Áreas comunales controladas por este lector</span>
            <div style={{ display: 'grid', gap: '6px', maxHeight: '180px', overflowY: 'auto', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '12px' }}>
              {amenities.map((a) => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 400 }}>
                  <input type="checkbox" checked={selectedAmenityIds.includes(a.id)} onChange={() => toggleAmenity(a.id)} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>

          {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}

          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar lector'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <HabitatDrawer
        open={openTarget !== null}
        title="Confirmar apertura remota"
        subtitle={openTarget ? `Se enviará la orden de apertura a ${openTarget.name} (puerta ${openTarget.doorNo}). La acción queda registrada en auditoría.` : undefined}
        onClose={() => (openBusy ? undefined : setOpenTarget(null))}
        width={440}
      >
        <form onSubmit={handleOpenDoor} style={{ display: 'grid', gap: '14px' }}>
          <label className="h-field">
            Motivo de la apertura (obligatorio)
            <textarea
              className="h-input"
              required
              rows={3}
              maxLength={OPEN_DOOR_REASON_MAX}
              placeholder="Ej.: Residente del 502 sin credencial, verificado por cédula."
              value={openReason}
              onChange={(e) => setOpenReason(e.target.value)}
              autoFocus
            />
            <small style={{ color: 'var(--muted-foreground)' }}>
              {openReason.length}/{OPEN_DOOR_REASON_MAX}
            </small>
          </label>
          {openError && <HabitatToast type="err" text={openError} onClose={() => setOpenError(null)} />}
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" disabled={openBusy} onClick={() => setOpenTarget(null)}>
              Cancelar
            </button>
            <button type="submit" className="h-btn-dark" disabled={openBusy || openReason.trim().length === 0}>
              <DoorOpen size={14} /> {openBusy ? 'Enviando…' : 'Abrir puerta'}
            </button>
          </div>
        </form>
      </HabitatDrawer>

      <HabitatDrawer
        open={rotateConfirmOpen}
        title="Rotar token del Edge Gateway"
        subtitle="Se generará un token nuevo para este edificio."
        onClose={() => (rotateBusy ? undefined : setRotateConfirmOpen(false))}
        width={440}
      >
        <div style={{ display: 'grid', gap: '14px' }}>
          <div className="h-notice h-notice-err" role="alert">
            <AlertTriangle size={16} />
            <span>
              El token anterior quedará revocado de inmediato: el gateway del edificio dejará de sincronizar lectores
              hasta que actualices su variable <code>GATEWAY_API_TOKEN</code> con el nuevo valor.
            </span>
          </div>
          {rotateError && <HabitatToast type="err" text={rotateError} onClose={() => setRotateError(null)} />}
          <div className="h-drawer-footer">
            <button type="button" className="h-btn-outline" disabled={rotateBusy} onClick={() => setRotateConfirmOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="h-btn-danger" disabled={rotateBusy} onClick={() => void handleRotateToken()}>
              <KeyRound size={14} /> {rotateBusy ? 'Rotando…' : 'Rotar token'}
            </button>
          </div>
        </div>
      </HabitatDrawer>

      <HabitatDrawer
        open={rotatedToken !== null}
        title="Nuevo token del gateway"
        subtitle="Cópialo ahora: por seguridad no se volverá a mostrar."
        onClose={closeTokenModal}
        width={480}
      >
        {rotatedToken && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div className="h-notice h-notice-err" role="alert">
              <AlertTriangle size={16} />
              <span>
                Este token no se volverá a mostrar. Actualiza <code>GATEWAY_API_TOKEN</code> en el Edge Gateway del
                edificio y reinícialo; el token anterior ya no funciona.
              </span>
            </div>
            <label className="h-field">
              Token
              <textarea
                className="h-input"
                readOnly
                rows={3}
                value={rotatedToken.token}
                onFocus={(e) => e.currentTarget.select()}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12.5px', wordBreak: 'break-all' }}
              />
            </label>
            <small style={{ color: 'var(--muted-foreground)' }}>
              Rotado el {formatDateTimeInZone(rotatedToken.rotatedAt, tenantTimezone)}
            </small>
            {rotateError && <HabitatToast type="err" text={rotateError} onClose={() => setRotateError(null)} />}
            <div className="h-drawer-footer">
              <button type="button" className="h-btn-outline" onClick={() => void copyToken()}>
                <Copy size={14} /> {copied ? 'Copiado' : 'Copiar token'}
              </button>
              <button type="button" className="h-btn-dark" onClick={closeTokenModal}>
                Ya lo guardé
              </button>
            </div>
          </div>
        )}
      </HabitatDrawer>
    </section>
  );
}
