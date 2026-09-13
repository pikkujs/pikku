import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { FlowNode } from './FlowNode'
import { GitCompare } from 'lucide-react'
import { useGraphActions } from '../../context/GraphHostContext'
import { useGraphHighlight } from '../../context/GraphHostContext'

interface SwitchNodeData {
  colorKey: string
  expression?: string
  cases?: Array<{ value: string }>
  stepName?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const SwitchNode: React.FC<GraphNodeProps<SwitchNodeData>> = ({
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
    const handles = []

    if (data.cases && data.cases.length > 0) {
      data.cases.forEach((caseItem) => {
        handles.push({ id: `case-${caseItem.value}`, label: caseItem.value })
      })
    }

    handles.push({ id: 'default', label: 'default' })
    handles.push({ id: 'after', label: 'after' })

    return handles
  }, [data.cases])

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'switch')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={GitCompare}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={outputHandles}
      size={80}
      label="Switch"
      subtitle={data.stepName}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getSwitchNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'switchNode',
    position,
    data: {
      colorKey: 'workflow',
      expression: step.expression,
      cases: step.cases,
      stepName: step.stepName,
      nodeType: 'flow',
    },
  }
}
