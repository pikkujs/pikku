import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { FlowNode } from './FlowNode'
import { Pause } from 'lucide-react'
import { useGraphActions } from '../../context/GraphHostContext'
import { useGraphHighlight } from '../../context/GraphHostContext'

interface SleepNodeData {
  colorKey: string
  title?: string
  description?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const SleepNode: React.FC<GraphNodeProps<SleepNodeData>> = ({
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
    openWorkflowStep(id, 'sleep')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={Pause}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={[{ id: 'default', label: '' }]}
      size={80}
      label="Sleep"
      subtitle={data.description}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getSleepNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'sleepNode',
    position,
    data: {
      colorKey: 'workflow',
      title: step.duration,
      description: step.stepName,
      nodeType: 'flow',
    },
  }
}
