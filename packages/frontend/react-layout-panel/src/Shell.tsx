import type { CSSProperties, FC, ReactNode } from 'react'

/**
 * A viewport-bound application shell.
 *
 * The shell owns the height of the window and nothing inside it is allowed to grow the
 * page. That single rule is what separates an app layout from a document layout, and it
 * is the reason for every `min-height: 0` in `shell.css`: a flex item defaults to
 * `min-height: auto`, which refuses to shrink below its content, so one missing
 * declaration anywhere in the chain hands the page scrollbar back to a long list and
 * everything sized as a fraction of the row — a canvas, a map, a video — collapses.
 *
 * Content scrolls in `Panel`, never here.
 */
export const Shell: FC<{
  /** Reserve the fixed `TabBar`'s height. Pass the same flag you render the bar on. */
  phone?: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
}> = ({ phone, className, style, children }) => (
  <div
    className={['pk-shell', phone ? 'pk-shell--phone' : '', className].filter(Boolean).join(' ')}
    style={style}
  >
    {children}
  </div>
)

/** A horizontal band of panels and stages that fills what is left of the shell. */
export const ShellRow: FC<{ className?: string; style?: CSSProperties; children: ReactNode }> = ({
  className,
  style,
  children,
}) => (
  <div className={['pk-shell-row', className].filter(Boolean).join(' ')} style={style}>
    {children}
  </div>
)

/**
 * The part that takes the space the panels do not.
 *
 * `position: relative`, because the thing a stage usually holds — a canvas, a map — has
 * to be taken out of flow and pinned to `inset: 0` to be sized by its container rather
 * than by its own content.
 */
export const Stage: FC<{ className?: string; style?: CSSProperties; children: ReactNode }> = ({
  className,
  style,
  children,
}) => (
  <div className={['pk-shell-stage', className].filter(Boolean).join(' ')} style={style}>
    {children}
  </div>
)
