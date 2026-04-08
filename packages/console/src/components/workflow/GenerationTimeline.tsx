import React from 'react'
import { Timeline, Text, ThemeIcon, Paper } from '@mantine/core'
import { Check, X, Loader2, Circle } from 'lucide-react'
import type { WorkflowStepData } from '@/hooks/useWorkflowRuns'

const STEP_LABELS: Record<string, string> = {
  'Summarise prompt': 'Understanding your request',
  'List functions': 'Listing available functions',
  'List tools': 'Listing available tools',
  'Select functions': 'Selecting relevant functions',
  'Select tools': 'Selecting relevant tools',
  'List middleware': 'Checking available middleware',
  'Get schemas': 'Loading function schemas',
  'Generate graph (attempt 1)': 'Generating workflow graph',
  'Generate graph (attempt 2)': 'Retrying graph generation',
  'Generate graph (attempt 3)': 'Final graph generation attempt',
  'Design agent (attempt 1)': 'Designing agent configuration',
  'Design agent (attempt 2)': 'Retrying agent design',
  'Design agent (attempt 3)': 'Final agent design attempt',
  'Validate graph': 'Validating graph',
  'Validate config': 'Validating agent configuration',
  'Name workflow': 'Naming your workflow',
  'Name agent': 'Naming your agent',
  'Store workflow': 'Storing workflow',
  'Write file': 'Writing agent file',
}

const statusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'teal'
    case 'failed':
      return 'red'
    case 'running':
      return 'blue'
    default:
      return 'dark'
  }
}

const StatusIcon: React.FunctionComponent<{ status: string }> = ({
  status,
}) => {
  switch (status) {
    case 'completed':
      return <Check size={12} />
    case 'failed':
      return <X size={12} />
    case 'running':
      return <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
    default:
      return <Circle size={10} />
  }
}

interface GenerationTimelineProps {
  steps: WorkflowStepData[]
}

export const GenerationTimeline: React.FunctionComponent<
  GenerationTimelineProps
> = ({ steps }) => {
  const sorted = [...steps].sort(
    (a, b) =>
      new Date(a.startedAt ?? 0).getTime() -
      new Date(b.startedAt ?? 0).getTime()
  )

  const activeIndex = sorted.findIndex(
    (s) => s.status === 'running' || s.status === 'pending'
  )

  return (
    <Paper p="lg" radius="md" withBorder>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <Timeline
        active={activeIndex === -1 ? sorted.length : activeIndex}
        bulletSize={24}
        lineWidth={2}
      >
        {sorted.map((step) => (
          <Timeline.Item
            key={step.stepId || step.stepName}
            bullet={
              <ThemeIcon
                size={24}
                radius="xl"
                color={statusColor(step.status)}
                variant="filled"
              >
                <StatusIcon status={step.status} />
              </ThemeIcon>
            }
            title={
              <Text size="sm" fw={step.status === 'running' ? 600 : 400}>
                {STEP_LABELS[step.stepName] || step.stepName}
              </Text>
            }
          >
            {step.duration != null && (
              <Text size="xs" c="dimmed">
                {(step.duration / 1000).toFixed(1)}s
              </Text>
            )}
            {step.status === 'failed' && step.error && (
              <Text size="xs" c="red.4">
                {step.error.message || JSON.stringify(step.error)}
              </Text>
            )}
          </Timeline.Item>
        ))}
      </Timeline>
    </Paper>
  )
}
