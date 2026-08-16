import React from 'react'
import { Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Check, Minus, X } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { ScenarioStepRow } from '@pikku/core/scenario'
import { runDuration } from './scenario-run-format'

const STEP_ICON = {
  passed: { Icon: Check, colour: 'var(--mantine-color-green-6)' },
  failed: { Icon: X, colour: 'var(--mantine-color-red-6)' },
  skipped: { Icon: Minus, colour: 'var(--mantine-color-dimmed)' },
}

type ScenarioRunStepsProps = {
  steps: ScenarioStepRow[]
}

/**
 * The ladder as the run recorded it — the sentences that were written at the
 * time, not the ones in the source today. A scenario is code and code moves, so
 * re-deriving the prose from the current suite would quietly rewrite history.
 */
export const ScenarioRunSteps: React.FC<ScenarioRunStepsProps> = ({ steps }) => {
  if (steps.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {m.scenario_runs_no_steps()}
      </Text>
    )
  }

  return (
    <Stack gap={2} data-testid="scenario-run-steps">
      {steps.map((step, index) => {
        const icon =
          STEP_ICON[step.status as keyof typeof STEP_ICON] ?? STEP_ICON.skipped
        return (
          <Group
            key={`${index}-${step.sentence}`}
            gap="sm"
            align="flex-start"
            wrap="nowrap"
          >
            <Box style={{ width: 16, flexShrink: 0, paddingTop: 3 }}>
              <icon.Icon size={13} strokeWidth={2.4} color={icon.colour} />
            </Box>
            <Text size="sm" style={{ lineHeight: 1.6, flex: 1 }}>
              {asI18n(step.sentence)}
            </Text>
            {step.durationMs !== undefined && (
              <Text size="xs" c="dimmed" ff="monospace" style={{ paddingTop: 3 }}>
                {asI18n(runDuration(step.durationMs))}
              </Text>
            )}
          </Group>
        )
      })}
    </Stack>
  )
}
