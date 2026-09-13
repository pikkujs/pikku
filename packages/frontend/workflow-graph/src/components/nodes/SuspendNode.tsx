import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { FlowNode } from './FlowNode'
import { Hourglass } from 'lucide-react'
import { useGraphActions } from '../../context/GraphHostContext'
import { useGraphHighlight } from '../../context/GraphHostContext'

interface SuspendNodeData {
  colorKey: string
  title?: string
  description?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const SuspendNode: React.FC<GraphNodeProps<SuspendNodeData>> = ({
  data,
  id,
}) => {
  const { openWorkflowStep } = useGraphActions()
  const graphHighlight = useGraphHighlight()

  const highlightType: HighlightType = React.useMemo(() => {
    if (!graphHighlight) return null
    if (graphHighlight.focusedNodeId === id) return 'focused'
    if (graphHighlight.referencedNodeId === id) return 'referenced'
    return null
  }, [graphHighlight, id])

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'suspend')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={Hourglass}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={[{ id: 'default', label: '' }]}
      size={80}
      label="Suspend"
      subtitle={data.description}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

/** A suspend is keyed in the run by its reason, not by its node id, so the
 *  reason is what the node has to show to be findable in a run. */
export const getSuspendNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'suspendNode',
    position,
    data: {
      colorKey: 'workflow',
      title: step.reason,
      description: step.reason ?? step.stepName,
      nodeType: 'flow',
    },
  }
}
