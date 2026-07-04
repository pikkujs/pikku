import React, { useMemo } from 'react'
import { Box, ScrollArea } from '@pikku/mantine/core'
import { usePikkuMeta } from '../../../context/PikkuMetaContext'
import { useWorkflowRunContextSafe } from '../../../context/WorkflowRunContext'
import { TimelineStep } from './TimelineStep'
import { buildFlowTimeline } from './timeline-model'
import type { PersonaRef } from '../../personas/persona-types'

type PersonaTimelineProps = {
  workflow: {
    nodes?: Record<string, any>
    entryNodeIds?: string[]
  }
}

export const PersonaTimeline: React.FC<PersonaTimelineProps> = ({
  workflow,
}) => {
  const { meta } = usePikkuMeta()
  const run = useWorkflowRunContextSafe()

  const timeline = useMemo(
    () => buildFlowTimeline(workflow.nodes, workflow.entryNodeIds),
    [workflow.nodes, workflow.entryNodeIds]
  )

  const actors = meta.userFlowActors ?? {}
  const stepStates = run?.stepStates

  return (
    <ScrollArea h="100%" type="auto">
      <Box p="xl" style={{ maxWidth: 760, margin: '0 auto' }}>
        {timeline.map((node, i) => {
          const actor: PersonaRef | undefined = node.actor
            ? {
                key: node.actor,
                name: (actors as any)[node.actor]?.name,
                jobTitle: (actors as any)[node.actor]?.jobTitle,
              }
            : undefined
          return (
            <TimelineStep
              key={node.nodeId}
              node={node}
              actor={actor}
              status={stepStates?.get(node.nodeId)?.status}
              isLast={i === timeline.length - 1}
            />
          )
        })}
      </Box>
    </ScrollArea>
  )
}
