import type { CSSProperties, FC, ReactNode } from 'react'

export interface ShellProps {
  /** Reserve the fixed `TabBar`'s height. Pass the same flag you render the bar on. */
  phone?: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
}

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
export const Shell: FC<ShellProps> = ({ phone, className, style, children }) => (
  <div
    className={['pk-shell', phone ? 'pk-shell--phone' : '', className]
      .filter(Boolean)
      .join(' ')}
    style={style}
  >
    {children}
  </div>
)
