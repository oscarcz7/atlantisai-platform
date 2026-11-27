'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DoorOpen, Plus, QrCode, Radio, RefreshCw, Trash2 } from 'lucide-react';
import { StatusBadge } from '@noah/ui';
import { DomainTag, HabitatDrawer, HabitatToast, ModuleHero, SearchableSelect } from '../../../components/habitat-ui';
import { useDashboard } from '../../../lib/dashboard-context';
import { getGatewayCommandMeta, READER_STATUS_LABELS } from '../../../lib/labels';

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
  const { me, tenantId, apiFetch } = useDashboard();
  const [readers, setReaders] = useState<ReaderRow[]>([]);
  const [amenities, setAmenities] = useState<AmenityOption[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  const [code, setCode] = useState('READER_GYM_01');
  const [name, setName] = useState('Lector Gimnasio');
  const [ip, setIp] = useState('192.168.1.64');
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [port, setPort] = useState('80');
  const [doorNo, setDoorNo] = useState('1');
  const [serial, setSerial] = useState('');
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = me.role === 'SUPERADMIN' || me.role === 'ADMIN';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
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
  }, [apiFetch, tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openNew() {
    setEditingId(undefined);
    setCode('');
    setName('');
    setIp('192.168.1.64');
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
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar este lector de la configuración?')) return;
    await apiFetch(`/access/readers/${id}`, { method: 'DELETE' });
    setToast('Lector eliminado.');
    await loadData();
  }

  async function handleOpenDoor(reader: ReaderRow) {
    await apiFetch(`/access/readers/${reader.id}/open`, {
      method: 'POST',
      body: { reason: 'Prueba de apertura remota PoC' },
    });
    setToast(`Orden de apertura remota encolada para ${reader.name}.`);
    await loadData();
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
              <button type="button" className="h-btn-dark" onClick={openNew}>
                <Plus size={15} /> Nuevo lector
              </button>
            )}
          </div>
        }
      />

      {toast && <HabitatToast type="ok" text={toast} onClose={() => setToast(null)} />}

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
                        onClick={() => void handleOpenDoor(r)}
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
                      {new Date(c.createdAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' })}
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
            <button type="submit" className="h-btn-dark">
              Guardar lector
            </button>
          </div>
        </form>
      </HabitatDrawer>
    </section>
  );
}
