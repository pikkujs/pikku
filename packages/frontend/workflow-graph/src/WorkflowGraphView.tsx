import React from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import {
  FlowDirectionContext,
  type FlowDirection,
} from './context/FlowDirectionContext'
import {
  GraphHostProvider,
  type WorkflowGraphHost,
} from './context/GraphHostContext'
import { WorkflowGraphFlow } from './WorkflowGraphFlow'

export interface WorkflowGraphViewProps {
  workflow: any
  /** 'RIGHT' (default) lays the graph out left→right; 'DOWN' top→bottom —
   *  use 'DOWN' when embedding in a narrow container like a side panel. */
  direction?: FlowDirection
  onPaneClick?: () => void
  /** Everything the graph cannot know on its own: where a node click goes,
   *  which node is highlighted, and the run whose state the nodes paint. */
  host?: WorkflowGraphHost
}

export const WorkflowGraphView: React.FC<WorkflowGraphViewProps> = (props) => {
  return (
    <FlowDirectionContext.Provider value={props.direction ?? 'RIGHT'}>
      <GraphHostProvider host={props.host ?? {}}>
        <ReactFlowProvider>
          <WorkflowGraphFlow {...props} />
        </ReactFlowProvider>
      </GraphHostProvider>
    </FlowDirectionContext.Provider>
  )
}
