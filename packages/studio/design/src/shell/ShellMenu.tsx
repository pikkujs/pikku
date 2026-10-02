// ─────────────────────────────────────────────────────────────────────────────
// Left-menu row + lens definitions for the Design shell. ShellMenuRow is the
// icon-chip row from the `/new project` rail: a 26px icon chip, a name, an
// optional mono sub-label, a left
// accent bar when selected, and a hover surface. Pure inline styles on `--app-*`.
//
// The artifact lens has no menu of its own — it is picked in ArtifactDialog,
// off the chevron in the sub-header — so nothing here is artifact-specific.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Box, Grid3x3, PencilLine } from 'lucide-react'
import { m } from '@/lib/i18n'
import { MONO } from './chrome'

export type Lens = 'library' | 'app' | 'artifact'

/** `name`/`blurb` are read at RENDER, not baked in here: this module is evaluated
 *  once at import, and the console can change the locale while we are mounted. */
export const LENSES: {
  id: Lens
  name: () => string
  icon: LucideIcon
  blurb: () => string
}[] = [
  {
    id: 'artifact',
    name: m.shell_lens_artifact,
    icon: PencilLine,
    blurb: m.shell_lens_artifact_blurb,
  },
  { id: 'app', name: m.shell_lens_app, icon: Box, blurb: m.shell_lens_app_blurb },
  { id: 'library', name: m.shell_lens_library, icon: Grid3x3, blurb: m.shell_lens_library_blurb },
]

export function ShellMenuRow({
  icon: Icon,
  dot,
  name,
  sub,
  selected,
  onClick,
}: {
  icon?: LucideIcon
  /** A `--app-*` (or any CSS) colour for a status dot, shown in place of an icon. */
  dot?: string
  name: string
  sub?: string
  selected: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const acc = 'var(--app-accent)'
  return (
    <button
      type="button"
      data-testid={`design-item-${name}`}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        borderRadius: 10,
        cursor: 'pointer',
        fontFamily: 'inherit',
        border: `0.5px solid ${selected ? acc : 'transparent'}`,
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
            top: 8,
            bottom: 8,
            width: 2.5,
            borderRadius: 2,
            background: acc,
          }}
        />
      )}
      {Icon && (
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: selected ? acc : 'var(--app-panel-bg-strong)',
            border: '0.5px solid var(--app-border)',
            color: selected ? '#fff' : 'var(--app-text-dim)',
            transition: 'background 120ms',
          }}
        >
          <Icon size={13} />
        </span>
      )}
      {!Icon && dot && (
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--app-panel-bg-strong)',
            border: '0.5px solid var(--app-border)',
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot }} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: 600,
            color: selected ? acc : 'var(--app-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </span>
        {sub && (
          <span
            style={{
              display: 'block',
              fontFamily: MONO,
              fontSize: 9.5,
              color: 'var(--app-text-faint)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 1,
            }}
          >
            {sub}
          </span>
        )}
      </span>
    </button>
  )
}
