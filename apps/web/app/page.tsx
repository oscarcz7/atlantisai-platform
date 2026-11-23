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
          Base técnica (Fase 0) operativa. Los módulos del dashboard administrativo se incorporan a
          partir de la especificación 002.
        </p>
      </section>
    </main>
  );
}
