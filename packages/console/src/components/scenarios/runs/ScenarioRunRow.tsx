import React from 'react'
import { Box, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioRunSummary } from '@pikku/core/ecosystem/scenario'
import { ScenarioRunStatusBadge } from './ScenarioRunStatusBadge'
import { runRelativeTime } from './scenario-run-format'

type ScenarioRunRowProps = {
  run: ScenarioRunSummary
  selected: boolean
  onSelect: (runId: string) => void
}

/**
 * One past run, as a line in the rail: when it ran, against what, and how it
 * came out. Enough to pick the one worth opening without reading any of them.
 */
export const ScenarioRunRow: React.FC<ScenarioRunRowProps> = ({
  run,
  selected,
  onSelect,
}) => (
  <Box
    data-testid={`scenario-run-row-${run.runId}`}
    onClick={() => onSelect(run.runId)}
    style={{
      padding: '8px 12px',
      borderRadius: 8,
      cursor: 'pointer',
      background: selected
        ? 'var(--mantine-color-default-hover)'
        : 'transparent',
    }}
  >
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text size="sm" fw={selected ? 600 : 500} lineClamp={1}>
        {asI18n(runRelativeTime(run.startedAt))}
      </Text>
      <ScenarioRunStatusBadge status={run.status} size="xs" />
    </Group>
    <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
      {m.scenario_runs_row_counts({
        environment: run.environment,
        passed: run.passed,
        failed: run.failed,
      })}
    </Text>
  </Box>
)
