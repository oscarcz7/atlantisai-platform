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
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: `var(--color-${meta.tone}-bg, #e8f3f5)`,
        color: `var(--color-${meta.tone})`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: 'currentColor',
        }}
      />
      {meta.label}
    </span>
  );
}

export function Money({ cents }: { cents: number }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatUsdCents(cents)}</span>;
}
