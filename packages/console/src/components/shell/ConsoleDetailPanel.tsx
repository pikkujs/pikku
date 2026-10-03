import { asI18n } from '@pikku/react'
import type { I18nNode } from '@pikku/react'
import { usePanelContext } from '../../context/PanelContext'
import { PanelContainer } from '../panel/PanelContainer'
import { ConsolePanel } from './ConsolePanel'

/**
 * The screen's selection, in the console's end-edge panel: a sibling card that
 * the page card shrinks to make room for.
 *
 * Mounted by the LAYOUT rather than by the shell, even though the shell owns
 * the panel context and the portal it lands in. A panel's content is whatever
 * the screen registered — a workflow node needs the workflow's providers, an
 * agent run needs the run's — and those live inside the screen. `createPortal`
 * keeps React context flowing from where the element is written, not from where
 * it lands, so rendering this here is what puts the panel body inside the tree
 * whose context it reads while it still paints on the content area's end edge.
 */
export function ConsoleDetailPanel({
  emptyMessage,
  workflowGraph,
}: {
  emptyMessage?: I18nNode
  workflowGraph?: boolean
}) {
  const { panels, activePanel, closePanel } = usePanelContext()
  const active = activePanel ? panels.get(activePanel) : null

  return (
    <ConsolePanel
      opened={!!active}
      onClose={() => activePanel && closePanel(activePanel)}
      title={active ? asI18n(active.title) : undefined}
      width={450}
      bodyStyle={{ padding: 0 }}
      testId="console-detail-panel"
    >
      <PanelContainer
        emptyMessage={emptyMessage}
        workflowGraph={workflowGraph}
        hideRootTitle
        hideClose
      />
    </ConsolePanel>
  )
}
