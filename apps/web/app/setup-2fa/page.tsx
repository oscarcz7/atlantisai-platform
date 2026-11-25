'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClientError, authApi } from '../../lib/api/auth';

export default function Setup2faPage() {
  const router = useRouter();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const setupToken = sessionStorage.getItem('noah_setup_token');
    if (!setupToken) {
      router.replace('/login');
      return;
    }
    authApi
      .setup2fa(setupToken)
      .then((data) => {
        setQrDataUrl(data.qrDataUrl);
        setSecret(data.secret);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'No se pudo generar el QR.');
      });
  }, [router]);

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    const setupToken = sessionStorage.getItem('noah_setup_token');
    if (!setupToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.confirm2fa(setupToken, code);
      sessionStorage.removeItem('noah_setup_token');
      sessionStorage.setItem('noah_access_token', res.accessToken);
      if (res.user.tenants[0]) {
        sessionStorage.setItem('noah_tenant_id', res.user.tenants[0].id);
      }
      setRecoveryCodes(res.recoveryCodes);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Código inválido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" style={{ maxWidth: '480px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '20px' }}>
          Configurar segundo factor (2FA obligatorio)
        </h1>

        {recoveryCodes ? (
          <div>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
              Guarda estos códigos de recuperación en un lugar seguro. Cada código sirve una sola
              vez si pierdes acceso a tu autenticador.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                padding: '12px',
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'monospace',
                fontSize: '14px',
                margin: '16px 0',
              }}
            >
              {recoveryCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              style={{
                padding: '11px 18px',
                borderRadius: '999px',
                border: 'none',
                backgroundColor: 'var(--color-dark)',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Continuar al dashboard
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
              Escanea el código QR con Google Authenticator, Authy o 1Password e ingresa el código de
              6 dígitos.
            </p>
            {qrDataUrl && (
              <div style={{ textAlign: 'center', margin: '16px 0' }}>
                <img src={qrDataUrl} alt="Código QR 2FA" width={200} height={200} />
                {secret && (
                  <p style={{ fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    Clave manual: {secret}
                  </p>
                )}
              </div>
            )}
            <form onSubmit={handleConfirm} style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
                Código de 6 dígitos
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    letterSpacing: '4px',
                  }}
                />
              </label>
              {error && (
                <div style={{ color: 'var(--color-danger)', fontSize: '13px' }}>{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {loading ? 'Activando...' : 'Activar 2FA'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
