import type { CSSProperties, FC, ReactNode } from 'react'

export interface StageProps {
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/**
 * The part that takes the space the panels do not.
 *
 * `position: relative`, because the thing a stage usually holds — a canvas, a map — has
 * to be taken out of flow and pinned to `inset: 0` to be sized by its container rather
 * than by its own content.
 */
export const Stage: FC<StageProps> = ({ className, style, children }) => (
  <div
    className={['pk-shell-stage', className].filter(Boolean).join(' ')}
    style={style}
  >
    {children}
  </div>
)
