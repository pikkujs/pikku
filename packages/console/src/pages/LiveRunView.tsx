import React from 'react'
import {
  Badge,
  Box,
  Center,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const GHERKIN_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But']

const HighlightedStep: React.FC<{ step: string }> = ({ step }) => {
  const keyword = GHERKIN_KEYWORDS.find((kw) => step.startsWith(kw + ' '))
  if (!keyword) {
    return (
      <Text component="span" ff="monospace" fz={12} c="var(--app-text, var(--mantine-color-text))">
        {asI18n(step)}
      </Text>
    )
  }
  const rest = step.slice(keyword.length)
  return (
    <Text component="span" ff="monospace" fz={12}>
      <Text component="span" ff="monospace" fz={12} fw={600} c="var(--mantine-color-blue-5)">
        {asI18n(keyword)}
      </Text>
      <Text component="span" ff="monospace" fz={12} c="var(--app-text, var(--mantine-color-text))">
        {asI18n(rest)}
      </Text>
    </Text>
  )
}

const SCENARIO_STATUS_BORDER: Record<string, string> = {
  pass: 'var(--mantine-color-green-6)',
  fail: 'var(--mantine-color-red-6)',
  pending: 'var(--mantine-color-gray-4)',
  running: 'var(--mantine-color-blue-6)',
}

export type CucumberStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'PENDING' | 'UNDEFINED' | 'AMBIGUOUS'

export type LiveStep = {
  step: string
  status: CucumberStatus | 'running'
  duration: number
  message?: string
}

export type LiveScenario = {
  id: string
  name: string
  uri: string
  status: CucumberStatus | 'pending' | 'running'
  steps: LiveStep[]
}

type LiveRunViewProps = { scenarios: LiveScenario[] }

const LiveRunView: React.FC<LiveRunViewProps> = ({ scenarios }) => {
  useLocale()

  if (scenarios.length === 0) {
    return (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">{m.live_run_running()}</Text>
        </Stack>
      </Center>
    )
  }

  return (
    <ScrollArea style={{ flex: 1 }}>
      <Stack gap="sm" p="md">
        {scenarios.map((scenario) => {
          const totalMs = scenario.steps.reduce((acc, s) => acc + s.duration, 0)
          const isPending = scenario.status === 'pending'
          const isRunning = scenario.status === 'running'
          const passed = scenario.status === 'PASSED'
          const statusColor = isPending ? 'gray' : isRunning ? 'blue' : passed ? 'green' : 'red'
          const borderLeft = isPending
            ? SCENARIO_STATUS_BORDER.pending
            : isRunning
              ? SCENARIO_STATUS_BORDER.running
              : passed
                ? SCENARIO_STATUS_BORDER.pass
                : SCENARIO_STATUS_BORDER.fail

          return (
            <Box
              key={scenario.id}
              style={{
                border: `1px solid var(--app-border, var(--mantine-color-default-border))`,
                borderRadius: 8,
                background: 'var(--app-panel-bg, var(--mantine-color-body))',
                overflow: 'hidden',
              }}
            >
              <Box
                px="md"
                py="xs"
                style={{
                  borderBottom:
                    scenario.steps.length > 0
                      ? `1px solid var(--app-border, var(--mantine-color-default-border))`
                      : undefined,
                  background: 'var(--app-surface, var(--mantine-color-default-hover))',
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    {isPending ? (
                      <Text fz={12} c="dimmed" style={{ lineHeight: 1, flexShrink: 0 }}>
                        {asI18n('○')}
                      </Text>
                    ) : isRunning ? (
                      <Loader size={12} style={{ flexShrink: 0 }} />
                    ) : (
                      <Text fz={12} fw={700} c={statusColor} style={{ lineHeight: 1, flexShrink: 0 }}>
                        {asI18n(passed ? '✓' : '✗')}
                      </Text>
                    )}
                    <Text ff="monospace" fz={13} fw={600} truncate>
                      {asI18n(scenario.name)}
                    </Text>
                  </Group>
                  <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                    {!isRunning && !isPending && scenario.steps.length > 0 && (
                      <Text fz={11} c="dimmed">
                        {asI18n(`${totalMs}ms`)}
                      </Text>
                    )}
                    <Badge color={statusColor} variant="light" size="sm">
                      {asI18n(isPending ? 'Pending' : isRunning ? 'Running' : passed ? 'Pass' : 'Fail')}
                    </Badge>
                  </Group>
                </Group>
              </Box>

              {scenario.steps.length > 0 && (
                <Box p="md">
                  <Stack gap={2} pl="sm" style={{ borderLeft: `3px solid ${borderLeft}` }}>
                    {scenario.steps.map((s, si) => (
                      <HighlightedStep key={si} step={s.step} />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          )
        })}
      </Stack>
    </ScrollArea>
  )
}

export default LiveRunView
