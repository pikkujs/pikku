// ─────────────────────────────────────────────────────────────────────────────
// Shell chrome atoms — the console-themed furniture of the unified Design shell
// (sub-header, left menu, theme drawer). These render under the console
// tokens so they match the console; only the component
// previews inside `PreviewProvider` carry the user's theme.
//
// Layout is inline-styled against the `--app-*` CSS variables emitted by
// `index.css` (same tokens as the console), so the chrome tracks light/dark automatically.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties, ReactNode } from 'react'
import { m } from '@/lib/i18n'

/** JetBrains Mono — loaded in index.html. Matches the design's mono labels. */
export const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"

/** Uppercase mono group label in the left menu / drawer sections. */
export function ShellMenuLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--app-text-faint)',
        padding: '2px 4px 4px',
        marginTop: 8,
      }}
    >
      {children}
    </div>
  )
}

/** Small mono eyebrow used above detail sub-sections (e.g. "Sizes"). */
export function Eyebrow({ children, tone }: { children: ReactNode; tone?: 'accent' }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: tone === 'accent' ? 'var(--app-accent)' : 'var(--app-text-faint)',
      }}
    >
      {children}
    </div>
  )
}

/** Dotted-grid stage that the detail previews float on. */
export function DottedStage({
  children,
  minHeight = 176,
  style,
}: {
  children: ReactNode
  minHeight?: number
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        minHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        borderRadius: 13,
        background: 'var(--app-panel-bg-soft)',
        border: '0.5px solid var(--app-border)',
        backgroundImage: 'radial-gradient(var(--app-border) 0.7px, transparent 0.7px)',
        backgroundSize: '13px 13px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** "Composed from shadcn primitives" footnote shown under a detail preview. */
export function ComposedNote({ parts, style }: { parts: string[]; style?: CSSProperties }) {
  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', ...style }}
    >
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-faint)' }}>
        {m.shell_composed_from()}
      </span>
      {parts.map((p, i) => (
        <span key={p} style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-faint)' }}>
          {i > 0 && <span style={{ color: 'var(--app-text-faint)', margin: '0 3px' }}>·</span>}
          {p}
        </span>
      ))}
    </div>
  )
}
