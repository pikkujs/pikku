import type { ElementType, ReactNode } from 'react'
import composerStyles from './ComposerShell.module.css'

export { composerStyles }

/**
 * Presentational shell for the prompt composer (rounded box + footer row).
 * It owns only the layout and styling — callers supply their own input and
 * send so this works both with the assistant-ui `ComposerPrimitive`
 * (OpenCode chat) and a plain controlled textarea (build-mode new project).
 *
 * Footer order: [leftActions] … spacer … [controls] [send].
 */
export function ComposerShell({
  component,
  input,
  leftActions,
  controls,
  send,
}: {
  /** Root element/component. OpenCode passes `ComposerPrimitive.Root` (a form
   *  bound to the assistant runtime); the build prompt uses the default div. */
  component?: ElementType
  input: ReactNode
  leftActions?: ReactNode
  controls?: ReactNode
  send: ReactNode
}) {
  const Root = (component ?? 'div') as ElementType
  return (
    <Root className={composerStyles.composerRoot}>
      {input}
      <div className={composerStyles.composerFooter}>
        {leftActions}
        <div className={composerStyles.composerSpacer} />
        {controls}
        {send}
      </div>
    </Root>
  )
}
