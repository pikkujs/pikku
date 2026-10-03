// ─────────────────────────────────────────────────────────────────────────────
// DesignNavPanel — the Design screen's nav, rendered by the CONSOLE as its own
// left panel card (the design-server iframe runs with `chrome=off` and is the
// detail pane only). The iframe still owns discovery, so the rows here come from
// its `catalog` / `artifacts` posts and a click posts `set-lens`/`set-section`
// back — the nav is console chrome, the content stays the shell's.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { type I18nNode } from '@pikku/react'

/** One nav row: a name, an optional sub-label, an accent bar while selected.
 *  Same silhouette as the shell's own menu row so moving it out here is a
 *  relocation, not a restyle. */
export function NavRow({
  name,
  testId,
  sub,
  selected,
  onClick,
}: {
  name: I18nNode
  /** The row's raw id — the same testid the shell's own menu row carried, so
   *  specs that clicked the in-iframe menu still address the row by name. */
  testId: string
  sub?: I18nNode
  selected: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={`design-item-${testId}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        borderRadius: 10,
        cursor: 'pointer',
        fontFamily: 'inherit',
        border: `0.5px solid ${selected ? 'var(--app-accent)' : 'transparent'}`,
        background: selected
          ? 'var(--app-surface-info)'
          : hover
            ? 'var(--app-panel-bg-strong)'
            : 'transparent',
        transition: 'all 120ms',
      }}
    >
      {selected && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 7,
            bottom: 7,
            width: 2.5,
            borderRadius: 2,
            background: 'var(--app-accent)',
          }}
        />
      )}
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: selected ? 'var(--app-accent)' : 'var(--app-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {name}
      </span>
      {sub && <span style={{ fontSize: 10, color: 'var(--app-text-faint)' }}>{sub}</span>}
    </button>
  )
}
