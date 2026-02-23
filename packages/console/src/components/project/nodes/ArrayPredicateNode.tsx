import React from 'react'
import { Node, NodeProps } from 'reactflow'
import { FlowNode } from './FlowNode'
import { CheckCircle } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { useWorkflowContextSafe } from '@/context/WorkflowContext'

interface ArrayPredicateNodeData {
  colorKey: string
  mode?: 'some' | 'every'
  sourceVar?: string
  itemVar?: string
  outputVar?: string
  stepName?: string
}

type HighlightType = 'focused' | 'referenced' | null

export const ArrayPredicateNode: React.FunctionComponent<
  NodeProps<ArrayPredicateNodeData>
> = ({ data, id }) => {
  const { openWorkflowStep } = usePanelContext()
  const workflowContext = useWorkflowContextSafe()

  const highlightType: HighlightType = React.useMemo(() => {
    if (!workflowContext) return null
    if (workflowContext.focusedNodeId === id) return 'focused'
    if (workflowContext.referencedNodeId === id) return 'referenced'
    return null
  }, [workflowContext, id])

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'arrayPredicate')
  }, [id, openWorkflowStep])

  const label =
    data.mode === 'some' ? 'Some' : data.mode === 'every' ? 'Every' : 'Check'

  return (
    <FlowNode
      icon={CheckCircle}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={[{ id: 'default', label: '' }]}
      size={80}
      label={label}
      subtitle={data.stepName}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getArrayPredicateNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'arrayPredicateNode',
    position,
    data: {
      colorKey: 'workflow',
      mode: step.mode,
      sourceVar: step.sourceVar,
      itemVar: step.itemVar,
      outputVar: step.outputVar,
      stepName: step.stepName,
      nodeType: 'flow',
    },
  }
}
