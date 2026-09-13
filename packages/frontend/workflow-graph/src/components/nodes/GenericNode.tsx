import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { Code } from 'lucide-react'
import { BaseNode } from './BaseNode'
import { useGraphActions } from '../../context/GraphHostContext'

interface GenericNodeData {
  icon: React.ComponentType<{ size?: number }>
  colorKey: string
  title: string
  description?: string
}

export const GenericNode: React.FC<GraphNodeProps<GenericNodeData>> = ({
  data,
  id,
}) => {
  const { openWorkflowStep } = useGraphActions()

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'generic')
  }, [id, openWorkflowStep])

  return (
    <BaseNode
      data={{
        ...data,
        onClick: handleClick,
      }}
      hasInput={true}
      hasOutput={true}
      width={200}
    />
  )
}

export const getGenericNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'genericNode',
    position,
    data: {
      icon: Code,
      colorKey: 'generic',
      title: 'Generic Node (Implementation Needed)',
      description: step.stepName,
      nodeType: 'internal',
    },
  }
}
