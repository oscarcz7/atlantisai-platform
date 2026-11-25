import type { Metadata, Viewport } from 'next';
import '@noah/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'NOAH — Plataforma de Gestión Residencial',
  description: 'Gestiona edificios, residentes, reservas, finanzas y garita desde un solo panel.',
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f4f2ee',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
