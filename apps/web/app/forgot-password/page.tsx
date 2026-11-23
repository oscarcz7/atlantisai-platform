'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authApi } from '../../lib/api/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await authApi.forgotPassword(email);
    setSent(true);
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
        <h1 style={{ margin: '0 0 8px', fontSize: '20px' }}>Recuperar acceso</h1>
        {sent ? (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Si el correo está registrado, enviamos un enlace para restablecer tu contraseña (válido
            por 1 hora).
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
            <label style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
              Correo electrónico
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                }}
              />
            </label>
            <button
              type="submit"
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
              Enviar enlace de recuperación
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
