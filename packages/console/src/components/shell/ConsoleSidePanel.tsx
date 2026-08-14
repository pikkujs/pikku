import type { ReactNode } from 'react'
import { PanelCard } from '../layout/PageLayout'
import { EdgePanel } from './EdgePanel'

/**
 * A form or inspector that reads FROM what the page is showing — the email
 * composer's variables, a render control — as a PANEL on the content column's
 * end edge.
 *
 * The mirror of ConsoleListPanel, and the static counterpart to
 * ConsoleDetailPanel: the detail panel is driven by a selection and comes and
 * goes with one, while this is part of the screen for as long as the screen is.
 * Either way it is a sibling card, so the page shrinks beside it rather than
 * carrying a welded sub-column that can never give its width back.
 */
export function ConsoleSidePanel({
  width,
  testId,
  children,
}: {
  width: number
  testId?: string
  children: ReactNode
}) {
  return (
    <EdgePanel opened side="end" width={width} testId={testId}>
      <PanelCard>{children}</PanelCard>
    </EdgePanel>
  )
}
