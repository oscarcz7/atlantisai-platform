'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiClientError } from '../lib/api/auth';

const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

const inputStyle = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
} as const;

/**
 * Shared form for one-time-token password flows (reset & invitation).
 * The token is read from the URL fragment-free query string and then removed from the
 * address bar so it does not linger in history or leak via Referer.
 */
export function TokenPasswordForm(props: {
  title: string;
  intro: string;
  submitLabel: string;
  onSubmit: (token: string, password: string) => Promise<string | void>;
  successText: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t);
    if (t) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || busy) return;
    if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
      setError(`La contraseña debe tener entre ${MIN_LENGTH} y ${MAX_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(token, password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'No pudimos completar la operación. Intenta de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1 style={{ margin: '0 0 8px', fontSize: '20px' }}>{props.title}</h1>
        {token === null ? (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            El enlace no es válido o está incompleto. Solicita uno nuevo.
          </p>
        ) : done ? (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{props.successText}</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)' }}>
              {props.intro}
            </p>
            <label style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
              Nueva contraseña
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                maxLength={MAX_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
              Confirmar contraseña
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={inputStyle}
              />
            </label>
            {error && (
              <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--color-danger, #b42318)' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: '10px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Procesando…' : props.submitLabel}
            </button>
          </form>
        )}
        <div style={{ marginTop: '16px', fontSize: '13px' }}>
          <Link href="/login" style={{ color: 'var(--color-primary)' }}>
            Volver al inicio de sesión
          </Link>
        </div>
      </section>
    </main>
  );
}
