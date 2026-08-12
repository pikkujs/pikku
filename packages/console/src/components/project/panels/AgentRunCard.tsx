import React from 'react'
import { Card, Divider, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { ScoreReadout } from './ScoreReadout'
import { useAgentRunScores } from '../../../hooks/useAgentRuns'

export type AgentRunCardProps = {
  run: {
    runId: string
    status: string
    createdAt?: string
    usageInputTokens?: number
    usageOutputTokens?: number
    usageModel?: string
  }
}

const relativeTime = (iso?: string): string => {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const min = Math.round((Date.now() - then) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

/**
 * A run and what the scorers made of it. The grades load per run rather than
 * per thread because most runs have none — sampling is a fraction — and a
 * thread-wide fetch would mostly return nothing for rows nobody scrolled to.
 */
export const AgentRunCard: React.FC<AgentRunCardProps> = ({ run }) => {
  useLocale()
  const { data: scores } = useAgentRunScores(run.runId)
  const grades = (scores as
    | { scorerName: string; score: number; reason?: string }[]
    | undefined) ?? []

  return (
    <Card withBorder radius="md" padding="sm" data-run-id={run.runId}>
      <Stack gap="xs">
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="sm" ff="monospace" truncate>
            {asI18n(run.runId.slice(0, 8))}
          </Text>
          <Group gap={6} wrap="nowrap">
            <Text size="xs" c="dimmed">
              {asI18n(relativeTime(run.createdAt))}
            </Text>
            <PikkuBadge type="status" value={run.status} variant="light" />
          </Group>
        </Group>

        {run.usageModel && (
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed" truncate>
              {asI18n(run.usageModel)}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {m.agent_run_tokens({
                input: run.usageInputTokens ?? 0,
                output: run.usageOutputTokens ?? 0,
              })}
            </Text>
          </Group>
        )}

        <Divider />

        {grades.length === 0 ? (
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              {m.agent_run_no_grades()}
            </Text>
            <Text size="xs" c="dimmed">
              {m.agent_run_no_grades_description()}
            </Text>
          </Stack>
        ) : (
          <Stack gap="sm">
            {grades.map((grade, index) => (
              <ScoreReadout
                key={`${grade.scorerName}-${index}`}
                scorerName={grade.scorerName}
                score={grade.score}
                reason={grade.reason}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
