import React from 'react'
import { Node, NodeProps } from 'reactflow'
import { FlowNode } from './FlowNode'
import { Repeat } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { useWorkflowContextSafe } from '@/context/WorkflowContext'

interface FanoutNodeData {
  colorKey: string
  childRpc?: string
  stepName?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const FanoutNode: React.FunctionComponent<NodeProps<FanoutNodeData>> = ({
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

  const outputHandles = [
    { id: 'each', label: 'each' },
    { id: 'done', label: 'done' },
  ]

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'fanout')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={Repeat}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={outputHandles}
      size={80}
      label="Loop"
      subtitle={data.stepName}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getFanoutNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'fanoutNode',
    position,
    data: {
      colorKey: 'workflow',
      childRpc: step.childRpc || step.eachRpc,
      stepName: step.stepName,
      nodeType: 'flow',
    },
  }
}
