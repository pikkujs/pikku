import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { SimpleGrid, Box } from '@pikku/mantine/core'
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
          <SimpleGrid
            cols={2}
            px="1rem"
            c="dimmed"
            mt="xs"
            style={{ alignItems: 'center' }}
          >
            <Box pos="relative" style={{ justifySelf: 'center' }}>
              <RotateCw size={16} strokeWidth={2} />
              {data.workflowRetries !== undefined &&
                data.workflowRetries > 0 && (
                  <GraphBadge
                    type="label"
                    size="sm"
                    pos="absolute"
                    top={-8}
                    right={-8}
                    circle
                    style={{
                      minWidth: 12,
                      height: 12,
                      padding: 2,
                      width: 'fit-content',
                    }}
                  >
                    {data.workflowRetries}
                  </GraphBadge>
                )}
            </Box>

            <Box pos="relative" style={{ justifySelf: 'center' }}>
              <Timer size={16} strokeWidth={2} />
              {data.workflowRetryDelay !== undefined &&
                data.workflowRetryDelay > 0 && (
                  <GraphBadge
                    type="label"
                    size="sm"
                    pos="absolute"
                    top={-8}
                    right={-8}
                    circle
                    style={{
                      minWidth: 12,
                      height: 12,
                      padding: 2,
                      width: 'fit-content',
                    }}
                  >
                    {data.workflowRetryDelay}
                  </GraphBadge>
                )}
            </Box>
          </SimpleGrid>
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
