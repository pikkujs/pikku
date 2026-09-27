import React from 'react'
import { Code, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioResult } from '@pikku/core/scenario'

/** A stack is hundreds of frames deep, and left loose it buries the run. */
const FAILURE_SCROLL = {
  background: 'var(--mantine-color-red-light)',
  color: 'var(--mantine-color-red-light-color)',
  maxHeight: 220,
  overflow: 'auto',
  maxWidth: '100%',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
} as const

type ScenarioFailureReportProps = {
  result: ScenarioResult
}

/**
 * Why one scenario stopped: the sentence it stopped on and what it said. Not
 * the stack — a scenario reader is reading their own suite, and hundreds of
 * frames of framework internals is the thing that buries the failure.
 */
export const ScenarioFailureReport: React.FC<ScenarioFailureReportProps> = ({
  result,
}) => (
  <Stack gap={4} data-testid={`scenario-failure-${result.name}`}>
    {result.failure?.sentence && (
      <Text size="sm" c="red" fw={500}>
        {asI18n(result.failure.sentence)}
      </Text>
    )}
    <Code block style={FAILURE_SCROLL}>
      {result.failure?.message ??
        result.error ??
        m.scenario_runs_unknown_failure()}
    </Code>
  </Stack>
)
