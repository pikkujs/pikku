import React from 'react'
import { Node, NodeProps } from 'reactflow'
import { FlowNode } from './FlowNode'
import { Workflow } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { useWorkflowContextSafe } from '@/context/WorkflowContext'

interface ParallelNodeData {
  colorKey: string
  childrenCount?: number
  stepName?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const ParallelNode: React.FunctionComponent<
  NodeProps<ParallelNodeData>
> = ({ data, id }) => {
  const { openWorkflowStep } = usePanelContext()
  const workflowContext = useWorkflowContextSafe()

  const highlightType: HighlightType = React.useMemo(() => {
    if (!workflowContext) return null
    if (workflowContext.focusedNodeId === id) return 'focused'
    if (workflowContext.referencedNodeId === id) return 'referenced'
    return null
  }, [workflowContext, id])

  const outputHandles = React.useMemo(() => {
    const handles = []
    const count = data.childrenCount || 0

    for (let i = 0; i < count; i++) {
      handles.push({ id: `child-${i}`, label: `${i + 1}` })
    }

    handles.push({ id: 'done', label: 'done' })

    return handles
  }, [data.childrenCount])

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'parallel')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={Workflow}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={outputHandles}
      size={80}
      label="Parallel"
      subtitle={data.stepName}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getParallelNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'parallelNode',
    position,
    data: {
      colorKey: 'workflow',
      childrenCount: step.children?.length || 0,
      stepName: step.stepName,
      nodeType: 'flow',
    },
  }
}
