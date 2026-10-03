import React from 'react'
import { Badge, Tooltip } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { AlertTriangle } from 'lucide-react'
import { useWorkflowRunContextSafe } from '../../context/WorkflowRunContext'
import { useWorkflowSurface } from '../../context/WorkflowSurfaceContext'
import { ThreePaneLayout } from '../layout/ThreePaneLayout'
import { WorkflowSelector } from '../project/WorkflowSelector'
import { WorkflowRunsPanel } from './WorkflowRunsPanel'
import { WorkflowGraphPanel } from './WorkflowGraphPanel'
import { WorkflowCanvasDrawer } from './WorkflowCanvasDrawer'

export interface WorkflowThreePaneProps {
  items: { name: string; description?: string }[]
  onItemSelect: (name: string) => void
  immersiveDetail?: boolean
}

/**
 * The console's own arrangement of the workflow panels: runs on the left, the
 * graph in the middle, the inspector on the right.
 *
 * This is one composition of the panels, not the only one — a host that wants a
 * different layout mounts `WorkflowRunsPanel` / `WorkflowGraphPanel` /
 * `WorkflowInspectorPanel` itself under a `WorkflowSurface`. The inspector is
 * supplied by `ThreePaneLayout`'s own right pane.
 */
export const WorkflowThreePane: React.FC<WorkflowThreePaneProps> = ({
  items,
  onItemSelect,
  immersiveDetail = false,
}) => {
  const { workflowName, isComplex } = useWorkflowSurface()
  const runContext = useWorkflowRunContextSafe()

  const complexNote = isComplex ? (
    <Tooltip
      label={asI18n(
        'This is a complex workflow. The visual representation may not be accurate.'
      )}
      multiline
      w={260}
    >
      <Badge
        color="yellow"
        variant="light"
        leftSection={<AlertTriangle size={12} />}
        style={{ textTransform: 'none' }}
      >
        {asI18n('Complex')}
      </Badge>
    </Tooltip>
  ) : undefined

  const lead = immersiveDetail ? undefined : (
    <WorkflowSelector
      workflowName={workflowName}
      items={items}
      onItemSelect={onItemSelect}
    />
  )

  return (
    <>
      <ThreePaneLayout
        lead={lead}
        filters={immersiveDetail ? undefined : complexNote}
        storageKey="workflow"
        listLabel={m.pane_runs()}
        showTabs={immersiveDetail}
        collapseWhenEmpty
        emptyPanelMessage={asI18n('Select a node to view its details')}
        runsPanel={runContext ? <WorkflowRunsPanel /> : undefined}
      >
        <WorkflowGraphPanel />
      </ThreePaneLayout>
      <WorkflowCanvasDrawer />
    </>
  )
}
