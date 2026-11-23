import Link from 'next/link';
import { StatusBadge } from '@noah/ui';

export default function HomePage() {
  return (
    <main style={{ maxWidth: '720px', margin: '64px auto', padding: '0 24px' }}>
      <section
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '20px' }}>Plataforma de Gestión Residencial</h1>
          <StatusBadge status="OK" />
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '12px' }}>
          Dashboard administrativo multi-edificio con autenticación 2FA TOTP y control por roles.
        </p>
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
          <Link
            href="/login"
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  );
}
