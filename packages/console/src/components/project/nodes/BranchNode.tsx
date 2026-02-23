import React from 'react'
import { Node, NodeProps } from 'reactflow'
import { FlowNode } from './FlowNode'
import { Split } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { useWorkflowContextSafe } from '@/context/WorkflowContext'

interface BranchNodeData {
  colorKey: string
  condition?: string
  hasElse?: boolean
  branchCount?: number
  stepName?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const BranchNode: React.FunctionComponent<NodeProps<BranchNodeData>> = ({
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
