import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { FlowNode } from './FlowNode'
import { Split } from 'lucide-react'
import { useGraphActions } from '../../context/GraphHostContext'
import { useGraphHighlight } from '../../context/GraphHostContext'

interface BranchNodeData {
  colorKey: string
  condition?: string
  hasElse?: boolean
  branchCount?: number
  stepName?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const BranchNode: React.FC<GraphNodeProps<BranchNodeData>> = ({
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

  const outputHandles = React.useMemo(() => {
    const handles = [{ id: 'true', label: 'if' }]

    if (data.branchCount && data.branchCount > 1) {
      for (let i = 1; i < data.branchCount; i++) {
        handles.push({ id: `branch-${i}`, label: `elif ${i}` })
      }
    }

    if (data.hasElse) {
      handles.push({ id: 'false', label: 'else' })
    }

    handles.push({ id: 'after', label: 'next' })
    return handles
  }, [data.hasElse, data.branchCount])

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'branch')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={Split}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={outputHandles}
      size={80}
      label="Branch"
      subtitle={data.stepName}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getBranchNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  const hasElse = !!step.elseEntry
  const branchCount = step.branches?.length || (step.thenEntry ? 1 : 0)

  return {
    id,
    type: 'branchNode',
    position,
    data: {
      colorKey: 'workflow',
      condition: step.condition || 'condition',
      hasElse,
      branchCount,
      stepName: step.stepName,
      nodeType: 'flow',
    },
  }
}
