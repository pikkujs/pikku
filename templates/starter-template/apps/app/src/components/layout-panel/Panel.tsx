import type { CSSProperties, FC, ReactNode } from 'react'

export type PanelSide = 'start' | 'end'

interface PanelBaseProps {
  /** Which edge it is docked to — decides the border and the rail's side. */
  side?: PanelSide
  width?: number
  /** Omit `onCollapse` for a panel that cannot be collapsed. */
  collapsed?: boolean
  onCollapse?: (collapsed: boolean) => void
  /** Controls in the header, to the right of the title. */
  actions?: ReactNode
  footer?: ReactNode
  className?: string
  style?: CSSProperties
  bodyStyle?: CSSProperties
  testId?: string
  children: ReactNode
}

/**
 * The rail's vertical label, and the accessible name of both collapse controls —
 * which are glyphs, and would otherwise be two unnamed buttons to a screen reader.
 *
 * A string `title` supplies that name itself; any other title cannot, so the label
 * is required alongside a non-string `title` rather than leaving the controls
 * unnamed.
 */
export type PanelProps = PanelBaseProps &
  (
    | { title: string; railLabel?: string }
    | { title: ReactNode; railLabel: string }
  )

/**
 * A docked column: a header that stays, a body that scrolls, an optional footer that
 * stays. Collapses to a labelled rail.
 *
 * The body is the ONLY scroller. Everything else in the panel is `flex-shrink: 0`, so a
 * five-hundred-row list moves under a heading that does not, and the panel's own height
 * never depends on what is in it.
 *
 * Collapsing to a rail rather than to nothing is deliberate: a panel that vanishes
 * leaves an unexplained gutter and no way back, so the rail keeps the panel's name in
 * vertical type and is itself the button that reopens it.
 */
export const Panel: FC<PanelProps> = ({
  title,
  side = 'start',
  width = 280,
  collapsed = false,
  onCollapse,
  railLabel,
  actions,
  footer,
  className,
  style,
  bodyStyle,
  testId,
  children,
}) => {
  const name = railLabel ?? (typeof title === 'string' ? title : undefined)

  if (collapsed && onCollapse) {
    return (
      <button
        type="button"
        className={`pk-rail pk-rail--${side}`}
        onClick={() => onCollapse(false)}
        aria-expanded={false}
        aria-label={name}
        data-testid={testId ? `${testId}-rail` : undefined}
      >
        <span aria-hidden>{side === 'start' ? '›' : '‹'}</span>
        <span className="pk-rail-label">{name}</span>
      </button>
    )
  }

  return (
    <section
      className={[`pk-panel pk-panel--${side}`, className].filter(Boolean).join(' ')}
      style={{ width, ...style }}
      data-testid={testId}
    >
      <header className="pk-panel-header">
        <span className="pk-panel-title">{title}</span>
        {actions}
        {onCollapse && (
          <button
            type="button"
            className="pk-panel-collapse"
            onClick={() => onCollapse(true)}
            aria-expanded
            aria-label={name}
            data-testid={testId ? `${testId}-collapse` : undefined}
          >
            <span aria-hidden>{side === 'start' ? '‹' : '›'}</span>
          </button>
        )}
      </header>
      <div className="pk-panel-body" style={bodyStyle}>
        {children}
      </div>
      {footer && <div className="pk-panel-footer">{footer}</div>}
    </section>
  )
}
