import React from 'react'
import { Node, NodeProps } from 'reactflow'
import { FlowNode } from './FlowNode'
import { XCircle } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'

interface CancelNodeData {
  colorKey: string
  stepName?: string
}

export const CancelNode: React.FunctionComponent<NodeProps<CancelNodeData>> = ({
  data,
  id,
}) => {
  const { openWorkflowStep } = usePanelContext()

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'cancel')
  }, [id, openWorkflowStep])

  return (
    <FlowNode
      icon={XCircle}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={[]}
      size={80}
      label="Cancel"
      subtitle={data.stepName}
      onClick={handleClick}
      nodeId={id}
    />
  )
}

export const getCancelNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'cancelNode',
    position,
    data: {
      colorKey: 'workflow',
      stepName: step.stepName,
      nodeType: 'flow',
    },
  }
}
