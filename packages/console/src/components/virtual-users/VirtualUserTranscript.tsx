import React from 'react'
import { Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useVirtualUserRunSteps } from '../../hooks/useVirtualUserRuns'
import { describeAction } from './virtual-user-model'

type StepRow = {
  index: number
  action: Record<string, unknown>
  status?: number
  ok?: boolean
  response?: string
  findingKinds?: string[]
}

/**
 * One run's turns, in the order they happened.
 *
 * Fetched when the run is opened rather than with the list: a run at a 500-step
 * budget carries more transcript than every other field on the row together.
 */
export const VirtualUserTranscript: React.FC<{ runId: string }> = ({
  runId,
}) => {
  const { data, isPending, error } = useVirtualUserRunSteps(runId)
  const steps = (data ?? []) as StepRow[]

  // Said out loud rather than shown as an empty transcript: a run that recorded
  // no turns and a read that was refused are opposite facts, and the second one
  // is the one somebody can act on.
  if (error) {
    return (
      <Text size="xs" c="red">
        {asI18n(error instanceof Error ? error.message : String(error))}
      </Text>
    )
  }
  if (isPending) {
    return (
      <Text size="xs" c="dimmed">
        {m.virtual_users_runs_loading()}
      </Text>
    )
  }
  if (steps.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        {m.virtual_users_runs_no_transcript()}
      </Text>
    )
  }

  return (
    <Stack gap={2} data-testid="virtual-user-transcript">
      {steps.map((step) => (
        <Group key={step.index} gap={8} wrap="nowrap" align="baseline">
          <Text size="xs" c="dimmed" ff="monospace" style={{ minWidth: 28 }}>
            {asI18n(String(step.index))}
          </Text>
          <Text size="xs" ff="monospace">
            {asI18n(describeAction(step.action))}
          </Text>
          {step.status !== undefined && (
            <Text size="xs" c={step.ok === false ? 'red' : 'dimmed'}>
              {asI18n(String(step.status))}
            </Text>
          )}
          {step.findingKinds?.map((kind) => (
            <Badge key={kind} size="xs" variant="light" color="orange" tt="none">
              {asI18n(kind)}
            </Badge>
          ))}
        </Group>
      ))}
    </Stack>
  )
}
