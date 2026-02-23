import React from 'react'
import { Node, NodeProps } from 'reactflow'
import { FlowNode } from './FlowNode'
import { Reply } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { useWorkflowContextSafe } from '@/context/WorkflowContext'

interface ReturnNodeData {
  colorKey: string
  stepName?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const ReturnNode: React.FunctionComponent<NodeProps<ReturnNodeData>> = ({
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
    openWorkflowStep(id, 'return')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={Reply}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={[]}
      size={80}
      label="Return"
      subtitle={data.stepName}
      onClick={handleClick}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getReturnNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'returnNode',
    position,
    data: {
      colorKey: 'workflow',
      stepName: step.stepName,
      nodeType: 'flow',
    },
  }
}
