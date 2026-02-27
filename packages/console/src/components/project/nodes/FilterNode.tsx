import React from 'react'
import type { Node, NodeProps } from 'reactflow'
import { FlowNode } from './FlowNode'
import { Filter } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { useWorkflowContextSafe } from '@/context/WorkflowContext'

interface FilterNodeData {
  colorKey: string
  sourceVar?: string
  itemVar?: string
  outputVar?: string
  stepName?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const FilterNode: React.FunctionComponent<NodeProps<FilterNodeData>> = ({
  data,
  id,
}) => {
  const { openWorkflowStep } = usePanelContext()
  const workflowContext = useWorkflowContextSafe()

  const highlightType: HighlightType = React.useMemo(() => {
    if (!workflowContext) return null
    if (workflowContext.focusedNodeId === id) return 'focused'
    if (workflowContext.referencedNodeId === id) return 'referenced'
    return null
  }, [workflowContext, id])

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'filter')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={Filter}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={[{ id: 'default', label: '' }]}
      size={80}
      label="Filter"
      subtitle={data.stepName}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getFilterNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'filterNode',
    position,
    data: {
      colorKey: 'workflow',
      sourceVar: step.sourceVar,
      itemVar: step.itemVar,
      outputVar: step.outputVar,
      stepName: step.stepName,
      nodeType: 'flow',
    },
  }
}
