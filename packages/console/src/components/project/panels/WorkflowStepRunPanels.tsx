import React from 'react'
import { Stack, Text, Group, Card, Table, Timeline, Box } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { CodeHighlight } from '@mantine/code-highlight'
import { Clock, AlertTriangle, CheckCircle, Play } from 'lucide-react'
import { useWorkflowRunContextSafe } from '../../../context/WorkflowRunContext'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { statusDefs } from '../../ui/badge-defs'
import { DataViewer } from '../../ui/DataViewer'
import { useWorkflowRunHistory } from '../../../hooks/useWorkflowRuns'
import { SectionLabel } from './shared/SectionLabel'
import { EmptyState } from './shared/EmptyState'

interface StepRunPanelProps {
  stepId: string
}

const formatTimestamp = (ts: string | undefined) => {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

const formatDuration = (start: string | undefined, end: string | undefined) => {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export const WorkflowStepExecution: React.FC<StepRunPanelProps> = ({
  stepId,
}) => {
  const runContext = useWorkflowRunContextSafe()
  const stepStates = runContext?.stepStates
  const step = stepStates?.get(stepId)

  if (!step) {
    return (
      <Stack gap="md">
        <SectionLabel>{asI18n('Execution')}</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section p="md">
            <EmptyState />
          </Card.Section>
        </Card>
      </Stack>
    )
  }

  const endTime = step.succeededAt || step.failedAt
  const duration = formatDuration(step.runningAt || step.createdAt, endTime)

  return (
    <Stack gap="md">
      <Group gap="xs">
        <SectionLabel>{asI18n('Execution')}</SectionLabel>
        <PikkuBadge type="status" value={step.status} variant="filled" />
      </Group>

      <Stack gap={6}>
        <SectionLabel>{asI18n('Timing')}</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section>
            <Table verticalSpacing={4} horizontalSpacing="xs">
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {asI18n('Created')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {asI18n(formatTimestamp(step.createdAt))}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {step.runningAt && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {asI18n('Started')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {asI18n(formatTimestamp(step.runningAt))}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {step.succeededAt && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {asI18n('Succeeded')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {asI18n(formatTimestamp(step.succeededAt))}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {step.failedAt && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {asI18n('Failed')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {asI18n(formatTimestamp(step.failedAt))}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {duration && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {asI18n('Duration')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace" fw={500}>
                        {asI18n(duration)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                <Table.Tr>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {asI18n('Attempts')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {asI18n(String(step.attemptCount))}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Card.Section>
        </Card>
      </Stack>
    </Stack>
  )
}

export const WorkflowStepInputData: React.FC<StepRunPanelProps> = ({
  stepId,
}) => {
  const runContext = useWorkflowRunContextSafe()
  const stepStates = runContext?.stepStates
  const step = stepStates?.get(stepId)

  return (
    <Stack gap={6}>
      <SectionLabel>{asI18n('Input Data')}</SectionLabel>
      <Card withBorder radius="md" padding={0}>
        <Card.Section p="md">
          {step?.data ? <DataViewer data={step.data} /> : <EmptyState />}
        </Card.Section>
      </Card>
    </Stack>
  )
}

export const WorkflowStepOutputData: React.FC<StepRunPanelProps> = ({
  stepId,
}) => {
  const runContext = useWorkflowRunContextSafe()
  const stepStates = runContext?.stepStates
  const step = stepStates?.get(stepId)

  return (
    <Stack gap={6}>
      <SectionLabel>{asI18n('Output Data')}</SectionLabel>
      <Card withBorder radius="md" padding={0}>
        <Card.Section p="md">
          {step?.result ? <DataViewer data={step.result} /> : <EmptyState />}
        </Card.Section>
      </Card>
    </Stack>
  )
}

export const WorkflowStepError: React.FC<StepRunPanelProps> = ({ stepId }) => {
  const runContext = useWorkflowRunContextSafe()
  const stepStates = runContext?.stepStates
  const step = stepStates?.get(stepId)

  if (!step?.error) {
    return (
      <Stack gap={6}>
        <SectionLabel>{asI18n('Error')}</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section p="md">
            <EmptyState />
          </Card.Section>
        </Card>
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <SectionLabel>{asI18n('Error')}</SectionLabel>

      <Stack gap={6}>
        <SectionLabel>{asI18n('Message')}</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section p="md">
            <Text size="sm" ff="monospace" c="red">
              {asI18n(typeof step.error.message === 'string'
                ? step.error.message
                : JSON.stringify(step.error.message, null, 2))}
            </Text>
          </Card.Section>
        </Card>
      </Stack>

      {step.error.code && (
        <Stack gap={6}>
          <SectionLabel>{asI18n('Code')}</SectionLabel>
          <Card withBorder radius="md" padding={0}>
            <Card.Section p="md">
              <PikkuBadge type="label" color="red">
                {asI18n(step.error.code)}
              </PikkuBadge>
            </Card.Section>
          </Card>
        </Stack>
      )}

      {step.error.stack && (
        <Stack gap={6}>
          <SectionLabel>{asI18n('Stack Trace')}</SectionLabel>
          <Card withBorder radius="md" padding={0}>
            <Card.Section p="md">
              <CodeHighlight code={step.error.stack} language="text" />
            </Card.Section>
          </Card>
        </Stack>
      )}
    </Stack>
  )
}

export const WorkflowStepRetryHistory: React.FC<StepRunPanelProps> = ({
  stepId,
}) => {
  const runContext = useWorkflowRunContextSafe()
  const selectedRunId = runContext?.selectedRunId ?? null
  const { data: history } = useWorkflowRunHistory(selectedRunId)

  const stepHistory = React.useMemo(() => {
    if (!history || !Array.isArray(history)) return []
    return history.filter((h: any) => h.stepName === stepId)
  }, [history, stepId])

  if (stepHistory.length <= 1) {
    return (
      <Stack gap={6}>
        <SectionLabel>{asI18n('Retry History')}</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section p="md">
            <Text c="dimmed" size="sm" ta="center">
              {asI18n('No retries')}
            </Text>
          </Card.Section>
        </Card>
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <Group gap="xs">
        <SectionLabel>{asI18n('Retry History')}</SectionLabel>
        <PikkuBadge type="label">{asI18n(`${stepHistory.length} attempts`)}</PikkuBadge>
      </Group>

      <Timeline active={stepHistory.length - 1} bulletSize={24} lineWidth={2}>
        {stepHistory.map((attempt: any, index: number) => {
          const icon =
            attempt.status === 'succeeded' ? (
              <CheckCircle size={14} />
            ) : attempt.status === 'failed' ? (
              <AlertTriangle size={14} />
            ) : attempt.status === 'running' ? (
              <Play size={14} />
            ) : (
              <Clock size={14} />
            )

          return (
            <Timeline.Item
              key={index}
              bullet={icon}
              color={statusDefs[attempt.status]?.color || 'gray'}
              title={`Attempt ${attempt.attemptCount}`}
            >
              <Group gap="xs">
                <PikkuBadge type="status" value={attempt.status} />
                <Text size="sm" c="dimmed">
                  {asI18n(formatTimestamp(attempt.createdAt))}
                </Text>
              </Group>
              {attempt.error && (
                <Text size="sm" c="red" mt={4}>
                  {asI18n(typeof attempt.error.message === 'string'
                    ? attempt.error.message
                    : JSON.stringify(attempt.error.message, null, 2))}
                </Text>
              )}
            </Timeline.Item>
          )
        })}
      </Timeline>
    </Stack>
  )
}
