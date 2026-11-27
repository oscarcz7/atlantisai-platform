'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CalendarDays, Clock, QrCode, ShieldAlert, Users } from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

interface PublicPassData {
  tenantName: string;
  timezone: string;
  amenities: string[];
  unitNumber: string | null;
  declaredAttendees: number;
  startsAt: string;
  endsAt: string;
  validFrom: string;
  validTo: string;
  employeeNo: string;
  code: string | null;
  syncStatus: string;
  reservationStatus: string;
  isRevoked: boolean;
  isExpired: boolean;
  qrDataUrl: string | null;
}

export default function PublicPassPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [pass, setPass] = useState<PublicPassData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/access/passes/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as PublicPassData & { message?: string };
        if (!res.ok) throw new Error(data.message ?? 'Pase no disponible.');
        setPass(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el pase.');
      });
  }, [token]);

  if (error) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#f1f5f9',
        }}
      >
        <div
          style={{
            maxWidth: '420px',
            width: '100%',
            background: '#fff',
            borderRadius: '20px',
            padding: '28px',
            textAlign: 'center',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
          }}
        >
          <ShieldAlert size={36} color="#dc2626" style={{ margin: '0 auto 12px' }} />
          <h1 style={{ fontSize: '19px', fontWeight: 700, margin: 0 }}>Pase no válido</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>{error}</p>
        </div>
      </main>
    );
  }

  if (!pass) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f1f5f9',
          color: '#475569',
        }}
      >
        Cargando tu pase digital...
      </main>
    );
  }

  const tz = pass.timezone || 'America/Guayaquil';
  const dateText = new Date(pass.startsAt).toLocaleDateString('es-EC', {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const startTime = new Date(pass.startsAt).toLocaleTimeString('es-EC', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const endTime = new Date(pass.endsAt).toLocaleTimeString('es-EC', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const validFromTime = new Date(pass.validFrom).toLocaleTimeString('es-EC', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
        background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      }}
    >
      <article
        style={{
          width: '100%',
          maxWidth: '430px',
          background: '#ffffff',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
        }}
      >
        <header style={{ background: '#0f172a', color: '#ffffff', padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', letterSpacing: '0.09em', color: '#94a3b8', fontWeight: 600 }}>
            <QrCode size={14} /> PASE DIGITAL DE ACCESO
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px' }}>
            {pass.amenities.join(' + ')}
          </h1>
          <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
            {pass.tenantName}
            {pass.unitNumber ? ` · Depto. ${pass.unitNumber}` : ''}
          </div>
        </header>

        <section style={{ padding: '20px 24px', display: 'grid', gap: '12px', fontSize: '14px', color: '#1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CalendarDays size={16} color="#475569" />
            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{dateText}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={16} color="#475569" />
            <span>
              <strong>
                {startTime} – {endTime}
              </strong>{' '}
              <span style={{ color: '#64748b', fontSize: '12.5px' }}>(puerta habilitada desde {validFromTime})</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={16} color="#475569" />
            <span>
              <strong>{pass.declaredAttendees}</strong> persona(s) autorizada(s)
            </span>
          </div>
        </section>

        <section
          style={{
            borderTop: '1px dashed #cbd5e1',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            background: '#f8fafc',
          }}
        >
          {pass.isRevoked ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#b91c1c', fontWeight: 700 }}>
              Este pase fue revocado o la reserva fue cancelada.
            </div>
          ) : pass.isExpired ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#92400e', fontWeight: 700 }}>
              La vigencia de este pase ha finalizado.
            </div>
          ) : (
            <>
              <div style={{ background: '#ffffff', padding: '12px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                {pass.qrDataUrl && (
                  <img
                    src={pass.qrDataUrl}
                    alt={`Código QR ${pass.code ?? ''}`}
                    style={{ width: '240px', height: '240px', display: 'block' }}
                  />
                )}
              </div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '20px', fontWeight: 700, letterSpacing: '0.08em', color: '#0f172a' }}>
                {pass.code}
              </div>
              <p style={{ fontSize: '12.5px', color: '#64748b', textAlign: 'center', margin: 0, lineHeight: 1.45 }}>
                Sube el brillo de tu pantalla y presenta este código QR a 15–20 cm de la cámara del lector Hikvision.
              </p>
            </>
          )}
        </section>
      </article>
    </main>
  );
}
