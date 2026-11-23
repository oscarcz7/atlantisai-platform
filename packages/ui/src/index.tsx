import { formatUsdCents } from '@noah/domain';
import { STATUS_MAP } from './status.js';

export * from './status.js';

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_MAP[status] ?? { label: status, tone: 'info' as const };
  return (
    <span
      data-tone={meta.tone}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '12px',
        fontWeight: 600,
        border: `1px solid var(--color-${meta.tone})`,
        color: `var(--color-${meta.tone})`,
      }}
    >
      {meta.label}
    </span>
  );
}

export function Money({ cents }: { cents: number }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatUsdCents(cents)}</span>;
}
