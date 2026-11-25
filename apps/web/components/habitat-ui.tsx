'use client';

import type { ReactNode } from 'react';
import { Check, AlertCircle, Sparkles, X, type LucideIcon } from 'lucide-react';

export function ModuleHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <header className="internal-hero">
      <div className="internal-hero-copy">
        <span className="internal-eyebrow">
          <Sparkles size={12} /> {eyebrow}
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="internal-hero-actions">{actions}</div>}
      <div className="internal-hero-mark" aria-hidden="true">
        <Icon size={54} strokeWidth={1.2} />
      </div>
    </header>
  );
}

export function HabitatTabs<T extends string>({
  items,
  active,
  onChange,
}: {
  items: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <nav className="h-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={active === item.key}
          className={`h-tab ${active === item.key ? 'h-tab-active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function HabitatToast({
  type,
  text,
  onClose,
}: {
  type: 'ok' | 'err';
  text: string;
  onClose?: () => void;
}) {
  return (
    <div className={`h-notice h-notice-${type}`} role={type === 'err' ? 'alert' : 'status'}>
      {type === 'ok' ? <Check size={16} /> : <AlertCircle size={16} />}
      <span>{text}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Cerrar aviso">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function HabitatDrawer({
  open,
  title,
  subtitle,
  onClose,
  width = 500,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="h-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="h-drawer" style={{ maxWidth: `${width}px` }}>
        <div className="h-drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="h-drawer-close"
            onClick={onClose}
            aria-label="Cerrar panel"
          >
            <X size={17} />
          </button>
        </div>
        <div className="h-drawer-body">{children}</div>
      </div>
    </div>
  );
}
