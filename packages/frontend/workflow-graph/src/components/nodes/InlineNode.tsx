import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { GraphBadge } from '../GraphBadge'
import { RotateCw, Timer, Code } from 'lucide-react'
import { BaseNode } from './BaseNode'
import { useGraphActions } from '../../context/GraphHostContext'

interface InlineNodeData {
  icon: React.ComponentType<{ size?: number }>
  colorKey: string
  title: string
  description?: string
  inWorkflow?: boolean
  onClick?: () => void
  workflowRetries?: number
  workflowRetryDelay?: number
}

export const InlineNode: React.FC<GraphNodeProps<InlineNodeData>> = ({
  data,
  id,
}) => {
  const { openWorkflowStep } = useGraphActions()

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'inline')
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
      additionalBody={
        data.inWorkflow ? (
          <div className="mt-2 grid grid-cols-2 items-center px-4 text-muted-foreground">
            <div className="relative justify-self-center">
              <RotateCw size={16} strokeWidth={2} />
              {data.workflowRetries !== undefined &&
                data.workflowRetries > 0 && (
                  <GraphBadge
                    type="label"
                    size="xs"
                    className="absolute -right-2 -top-2"
                  >
                    {data.workflowRetries}
                  </GraphBadge>
                )}
            </div>

            <div className="relative justify-self-center">
              <Timer size={16} strokeWidth={2} />
              {data.workflowRetryDelay !== undefined &&
                data.workflowRetryDelay > 0 && (
                  <GraphBadge
                    type="label"
                    size="xs"
                    className="absolute -right-2 -top-2"
                  >
                    {data.workflowRetryDelay}
                  </GraphBadge>
                )}
            </div>
          </div>
        ) : undefined
      }
    />
  )
}

export const getInlineNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: 'inlineNode',
    position,
    data: {
      icon: Code,
      colorKey: 'workflow',
      title: 'Inline',
      description: step.stepName,
      inWorkflow: true,
      workflowRetries: step.options?.retries,
      workflowRetryDelay:
        typeof step.options?.retryDelay === 'number'
          ? step.options.retryDelay
          : undefined,
      nodeType: 'internal',
    },
  }
}
