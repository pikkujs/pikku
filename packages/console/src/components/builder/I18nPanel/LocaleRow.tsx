import { getLanguageLabel } from './internal.js'
import { EditableChip } from './EditableChip.js'

// ─── One locale row ───────────────────────────────────────────────────────────

export function LocaleRow({
  code,
  value,
  saving,
  onChange,
}: {
  code: string
  value: string
  saving: boolean
  onChange: (v: string) => void
}) {
  const label = getLanguageLabel(code)
  return (
    <div
      data-testid={`i18n-locale-row-${code}`}
      style={{
        padding: '10px 14px 11px',
        borderBottom: '1px solid var(--app-border)',
        opacity: saving ? 0.6 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--app-text)', flex: 1 }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: 'var(--app-text-faint)',
            opacity: 0.7,
          }}
        >
          {code}
        </span>
      </div>
      <EditableChip value={value} onChange={onChange} />
    </div>
  )
}
