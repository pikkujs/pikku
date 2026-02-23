import React from 'react'
import { Node, NodeProps } from 'reactflow'
import { FlowNode } from './FlowNode'
import { Pause } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { useWorkflowContextSafe } from '@/context/WorkflowContext'

interface SleepNodeData {
  colorKey: string
  title?: string
  description?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const SleepNode: React.FunctionComponent<NodeProps<SleepNodeData>> = ({
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
