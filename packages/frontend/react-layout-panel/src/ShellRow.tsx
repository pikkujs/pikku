import type { CSSProperties, FC, ReactNode } from 'react'

export interface ShellRowProps {
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** A horizontal band of panels and stages that fills what is left of the shell. */
export const ShellRow: FC<ShellRowProps> = ({
  className,
  style,
  children,
}) => (
  <div
    className={['pk-shell-row', className].filter(Boolean).join(' ')}
    style={style}
  >
    {children}
  </div>
)
