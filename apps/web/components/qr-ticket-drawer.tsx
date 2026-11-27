'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import { HabitatDrawer, HabitatToast } from './habitat-ui';
import { useDashboard } from '../lib/dashboard-context';

export interface ReservationTicketData {
  reservationId: string;
  tenantName: string;
  timezone: string;
  amenities: Array<{ id: string; code: string; name: string }>;
  unitNumber: string | null;
  personName: string | null;
  personWaPhone: string | null;
  startsAt: string;
  endsAt: string;
  declaredAttendees: number;
  status: string;
  credential: {
    id: string;
    employeeNo: string;
    code: string;
    validFrom: string;
    validTo: string;
    syncStatus: string;
    lastError: string | null;
    syncedAt: string | null;
  };
  readers: Array<{ id: string; code: string; name: string; status: string; ip: string }>;
  qrDataUrl: string;
  passToken: string;
  passUrl: string;
  whatsappMessage: string;
  whatsappUrl: string;
}

const SYNC_STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  LOADED: { label: 'Cargado en lector Hikvision', bg: '#e8f5ee', color: '#1f7a53' },
  PENDING: { label: 'Pendiente de sincronizar con lector', bg: '#fef3c7', color: '#92400e' },
  REVOKE_PENDING: { label: 'Revocación en cola', bg: '#fee2e2', color: '#991b1b' },
  REVOKED: { label: 'QR Revocado', bg: '#fee2e2', color: '#991b1b' },
  ERROR: { label: 'Error de sincronización', bg: '#fee2e2', color: '#991b1b' },
};

function formatDateEc(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('es-EC', {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeEc(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

async function renderTicketPngBlob(ticket: ReservationTicketData): Promise<Blob> {
  const width = 840;
  const height = 1140;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // Card
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(36, 36, width - 72, height - 72, 28);
  ctx.fill();
  ctx.stroke();

  // Dark Header
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(36, 36, width - 72, 160, [28, 28, 0, 0]);
  ctx.fill();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.fillText('TICKET DE ACCESO QR', 76, 94);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 38px system-ui, -apple-system, sans-serif';
  ctx.fillText(ticket.tenantName.toUpperCase(), 76, 148);

  const tz = ticket.timezone || 'America/Guayaquil';
  const amenityLabel = ticket.amenities.map((a) => a.name).join(' + ');
  const dateLabel = formatDateEc(ticket.startsAt, tz);
  const timeLabel = `${formatTimeEc(ticket.startsAt, tz)} – ${formatTimeEc(ticket.endsAt, tz)}`;
  const validFromLabel = formatTimeEc(ticket.credential.validFrom, tz);

  // Amenity title
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 32px system-ui, -apple-system, sans-serif';
  ctx.fillText(amenityLabel.slice(0, 38), 76, 260);

  // Details grid
  const rows: Array<[string, string]> = [
    ['Fecha', dateLabel],
    ['Horario reservado', `${timeLabel} (acceso desde ${validFromLabel})`],
    ['Personas declaradas', `${ticket.declaredAttendees} persona(s)`],
    [
      'Unidad / Titular',
      `${ticket.unitNumber ? `Depto. ${ticket.unitNumber}` : 'Administración'}${ticket.personName ? ` · ${ticket.personName}` : ''}`,
    ],
  ];

  let y = 314;
  for (const [label, value] of rows) {
    ctx.fillStyle = '#64748b';
    ctx.font = '600 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(label.toUpperCase(), 76, y);
    ctx.fillStyle = '#1e293b';
    ctx.font = '600 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(value.slice(0, 52), 76, y + 32);
    y += 74;
  }

  // Divider
  ctx.strokeStyle = '#cbd5e1';
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(76, y + 6);
  ctx.lineTo(width - 76, y + 6);
  ctx.stroke();
  ctx.setLineDash([]);

  // Load QR image
  const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen QR'));
    img.src = ticket.qrDataUrl;
  });

  const qrSize = 340;
  const qrX = (width - qrSize) / 2;
  const qrY = y + 30;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Code below QR
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(ticket.credential.code, width / 2, qrY + qrSize + 40);

  ctx.fillStyle = '#64748b';
  ctx.font = '500 18px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `ID Lector: ${ticket.credential.employeeNo} · Presenta este QR en la cámara del lector`,
    width / 2,
    qrY + qrSize + 76,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo generar el PNG'));
    }, 'image/png');
  });
}

export function QrTicketDrawer({
  reservationId,
  onClose,
}: {
  reservationId: string | null;
  onClose: () => void;
}) {
  const { apiFetch } = useDashboard();
  const [ticket, setTicket] = useState<ReservationTicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [customPhone, setCustomPhone] = useState('');
  const [syncing, setSyncing] = useState(false);

  const loadTicket = useCallback(async () => {
    if (!reservationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ReservationTicketData>(`/access/reservations/${reservationId}/ticket`);
      setTicket(data);
      setCustomPhone(data.personWaPhone ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el ticket QR.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, reservationId]);

  useEffect(() => {
    if (reservationId) {
      void loadTicket();
    } else {
      setTicket(null);
    }
  }, [reservationId, loadTicket]);

  function getWhatsAppUrl(): string {
    if (!ticket) return '#';
    const clean = customPhone.replace(/[^\d]/g, '');
    const encoded = encodeURIComponent(ticket.whatsappMessage);
    return clean ? `https://wa.me/${clean}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }

  async function handleDownloadPng() {
    if (!ticket) return;
    try {
      const blob = await renderTicketPngBlob(ticket);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = ticket.amenities.map((x) => x.code.toLowerCase()).join('-');
      a.href = url;
      a.download = `ticket-qr-${slug}-${ticket.credential.code}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setToast('Ticket PNG descargado. Puedes adjuntarlo directo en WhatsApp.');
    } catch {
      setError('No se pudo exportar la imagen PNG.');
    }
  }

  async function handleCopyPng() {
    if (!ticket) return;
    try {
      const blob = await renderTicketPngBlob(ticket);
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setToast('Imagen del ticket copiada al portapapeles. Pégala en WhatsApp con Cmd+V / Ctrl+V.');
        return;
      }
      await handleDownloadPng();
    } catch {
      await handleDownloadPng();
    }
  }

  async function handleCopyLink() {
    if (!ticket) return;
    await navigator.clipboard.writeText(ticket.passUrl);
    setToast('Enlace del pase digital copiado al portapapeles.');
  }

  async function handleResync() {
    if (!ticket) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await apiFetch<{ readerCount: number }>(
        `/access/reservations/${ticket.reservationId}/resync`,
        { method: 'POST' },
      );
      setToast(
        res.readerCount > 0
          ? `Comando encolado para ${res.readerCount} lector(es) Hikvision.`
          : 'Sin lectores vinculados a esta área todavía. Agrégalos en el menú "Accesos QR".',
      );
      await loadTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al re-sincronizar.');
    } finally {
      setSyncing(false);
    }
  }

  const syncMeta = ticket
    ? SYNC_STATUS_META[ticket.credential.syncStatus] ?? SYNC_STATUS_META.PENDING!
    : null;

  return (
    <HabitatDrawer
      open={Boolean(reservationId)}
      title="Ticket de acceso QR"
      subtitle="Listo para enviar por tu WhatsApp y validar en el lector Hikvision."
      onClose={onClose}
      width={500}
    >
      {loading && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
          Generando ticket QR...
        </div>
      )}

      {error && <HabitatToast type="err" text={error} onClose={() => setError(null)} />}
      {toast && <HabitatToast type="ok" text={toast} onClose={() => setToast(null)} />}

      {ticket && !loading && (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Visual Ticket Preview */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '18px',
              overflow: 'hidden',
              background: '#ffffff',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div style={{ background: '#0f172a', color: '#fff', padding: '16px 20px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 600 }}>
                TICKET DE RESERVA · {ticket.tenantName.toUpperCase()}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>
                {ticket.amenities.map((a) => a.name).join(' + ')}
              </div>
            </div>

            <div style={{ padding: '18px 20px', display: 'grid', gap: '10px', fontSize: '13.5px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Fecha
                  </div>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                    {formatDateEc(ticket.startsAt, ticket.timezone)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Horario
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {formatTimeEc(ticket.startsAt, ticket.timezone)} – {formatTimeEc(ticket.endsAt, ticket.timezone)}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted-foreground)' }}>
                    Acceso desde {formatTimeEc(ticket.credential.validFrom, ticket.timezone)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Personas
                  </div>
                  <div style={{ fontWeight: 600 }}>{ticket.declaredAttendees} asistente(s)</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                    Unidad / Titular
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {ticket.unitNumber ? `Depto. ${ticket.unitNumber}` : 'Admin'}
                    {ticket.personName ? ` · ${ticket.personName}` : ''}
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px dashed var(--border)',
                  marginTop: '4px',
                  paddingTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <img
                  src={ticket.qrDataUrl}
                  alt={`QR ${ticket.credential.code}`}
                  style={{ width: '210px', height: '210px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                />
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '17px', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {ticket.credential.code}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted-foreground)' }}>
                  ID Hikvision: <strong>{ticket.credential.employeeNo}</strong>
                </div>

                {syncMeta && (
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      background: syncMeta.bg,
                      color: syncMeta.color,
                    }}
                  >
                    {ticket.readers.length === 0
                      ? 'Sin lector físico vinculado (listo para PoC)'
                      : syncMeta.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* WhatsApp Send Controls */}
          <div className="h-panel" style={{ display: 'grid', gap: '10px', padding: '14px' }}>
            <label className="h-field" style={{ margin: 0 }}>
              <span>Número de WhatsApp destino (puedes poner el tuyo para probar)</span>
              <input
                type="tel"
                className="h-input"
                placeholder="+593999999999"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
              />
            </label>

            <a
              href={getWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="h-btn-dark"
              style={{
                justifyContent: 'center',
                background: '#16a34a',
                borderColor: '#16a34a',
                textDecoration: 'none',
              }}
            >
              <MessageCircle size={16} /> Enviar ticket por mi WhatsApp
            </a>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button type="button" className="h-btn-outline" onClick={() => void handleCopyPng()}>
                <Copy size={14} /> Copiar imagen PNG
              </button>
              <button type="button" className="h-btn-outline" onClick={() => void handleDownloadPng()}>
                <Download size={14} /> Descargar PNG
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button type="button" className="h-btn-outline" onClick={() => void handleCopyLink()}>
                <QrCode size={14} /> Copiar link del pase
              </button>
              <a
                href={ticket.passUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-btn-outline"
                style={{ justifyContent: 'center', textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> Abrir pase público
              </a>
            </div>
          </div>

          {/* Hikvision Sync Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="h-btn-outline h-btn-sm"
              disabled={syncing}
              onClick={() => void handleResync()}
            >
              <RefreshCw size={13} /> {syncing ? 'Encolando...' : 'Re-sincronizar Hikvision'}
            </button>
            <button type="button" className="h-btn-outline h-btn-sm" onClick={onClose}>
              <Check size={13} /> Cerrar
            </button>
          </div>
        </div>
      )}
    </HabitatDrawer>
  );
}
