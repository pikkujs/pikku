import React, { useMemo } from 'react'
import {
  Box,
  ScrollArea,
  Center,
  Stack,
  Text,
  ThemeIcon,
} from '@pikku/mantine/core'
import { Route } from 'lucide-react'
import { asI18n } from '@pikku/react'
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

  const actors = meta.scenarioActors ?? {}
  const stepStates = run?.stepStates

  if (timeline.length === 0) {
    return (
      <Center h="100%" p="xl">
        <Stack align="center" gap={10}>
          <ThemeIcon variant="light" color="gray" size={44} radius="md">
            <Route size={22} />
          </ThemeIcon>
          <Text fw={600}>{asI18n('No steps to show')}</Text>
          <Text size="sm" c="dimmed" ta="center" maw={360}>
            {asI18n(
              'This scenario has no workflow steps — actors call the API directly, or the flow returns without any `workflow.do` calls.'
            )}
          </Text>
        </Stack>
      </Center>
    )
  }

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
