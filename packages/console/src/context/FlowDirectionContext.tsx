import { createContext, useContext } from 'react'

/** Layout direction for a workflow/wiring graph: 'RIGHT' = left→right (default),
 *  'DOWN' = top→bottom (used when embedding a graph in a narrow side panel).
 *  Nodes read this to place their reactflow handles on the matching edges. */
export type FlowDirection = 'RIGHT' | 'DOWN'

export const FlowDirectionContext = createContext<FlowDirection>('RIGHT')

export const useFlowDirection = (): FlowDirection =>
  useContext(FlowDirectionContext)
