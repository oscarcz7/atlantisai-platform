'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiClientError, authApi } from '../../lib/api/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.login({
        email,
        password,
        ...(needsTotp && totpCode ? { totpCode } : {}),
      });

      if (res.requires2faSetup && res.setupToken) {
        sessionStorage.setItem('noah_setup_token', res.setupToken);
        router.push('/setup-2fa');
        return;
      }

      if (res.accessToken && res.user) {
        sessionStorage.setItem('noah_access_token', res.accessToken);
        if (res.user.tenants[0]) {
          sessionStorage.setItem('noah_tenant_id', res.user.tenants[0].id);
        }
        router.push('/dashboard/users');
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'TOTP_REQUIRED') {
        setNeedsTotp(true);
        setError(err.message);
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('No se pudo conectar con el servidor.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: '420px', margin: '72px auto', padding: '0 20px' }}>
      <section
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '28px',
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: '20px' }}>Iniciar sesión</h1>
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
          Plataforma de Gestión Residencial — Acceso interno
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
          <label style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
            Correo electrónico
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@edificionoah.com"
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
            Contraseña
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
          </label>

          {needsTotp && (
            <label style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
              Código de verificación (6 dígitos)
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
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
          )}

          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-danger)',
                color: 'var(--color-danger)',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
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
            {loading ? 'Verificando...' : needsTotp ? 'Verificar y entrar' : 'Continuar'}
          </button>
        </form>

        <div style={{ marginTop: '16px', fontSize: '13px' }}>
          <Link href="/forgot-password" style={{ color: 'var(--color-primary)' }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </section>
    </main>
  );
}
