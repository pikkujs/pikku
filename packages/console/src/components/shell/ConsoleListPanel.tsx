import type { ReactNode } from 'react'
import { PanelCard } from '../layout/PageLayout'
import { EdgePanel } from './EdgePanel'

/**
 * The screen's list — the runs, the conversations, the features it selects
 * between — as a PANEL of its own on the content column's start edge.
 *
 * It is a sibling card to the page, not a column welded inside it: selecting
 * what the page shows is a different job from showing it, so the two read as two
 * surfaces, and the page card shrinks to make room exactly as it does for the
 * detail panel on the other edge. No header band — the list brings its own row,
 * with the control that collapses it (see PaneCollapseContext).
 */
export function ConsoleListPanel({
  width,
  testId,
  children,
}: {
  /** The collapsed rail is just a narrower panel, so the caller sizes it. */
  width: number
  testId?: string
  children: ReactNode
}) {
  return (
    <EdgePanel opened side="start" width={width} testId={testId}>
      <PanelCard>{children}</PanelCard>
    </EdgePanel>
  )
}
