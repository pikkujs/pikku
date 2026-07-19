import React from 'react'
import { ReactFlowProvider } from 'reactflow'
import {
  FlowDirectionContext,
  type FlowDirection,
} from '../../context/FlowDirectionContext'
import { WorkflowGraphFlow } from './WorkflowGraphFlow'

export interface WorkflowGraphViewProps {
  workflow: any
  /** 'RIGHT' (default) lays the graph out left→right; 'DOWN' top→bottom —
   *  use 'DOWN' when embedding in a narrow container like a side panel. */
  direction?: FlowDirection
  onPaneClick?: () => void
}

/** Standalone workflow graph renderer: createFlow → ELK layout → reactflow,
 *  with its own ReactFlowProvider so it can be embedded anywhere (full canvas
 *  page, side panel, …). Interactivity (node click → panels) comes from the
 *  surrounding Panel/Workflow contexts, which the host must provide. */
export const WorkflowGraphView: React.FC<WorkflowGraphViewProps> = (props) => {
  return (
    <FlowDirectionContext.Provider value={props.direction ?? 'RIGHT'}>
      <ReactFlowProvider>
        <WorkflowGraphFlow {...props} />
      </ReactFlowProvider>
    </FlowDirectionContext.Provider>
  )
}
