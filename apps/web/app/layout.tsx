import type { Metadata } from 'next';
import '@noah/ui/tokens.css';

export const metadata: Metadata = {
  title: 'Plataforma de Gestión Residencial — NOAH',
  description: 'Dashboard administrativo multi-edificio',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
      >
        {children}
      </body>
    </html>
  );
}
