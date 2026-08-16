import React from 'react'
import { Center, Loader, ScrollArea, Stack, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import type { ScenarioRunSummary } from '@pikku/core/scenario'
import { ScenarioRunRow } from './ScenarioRunRow'

type ScenarioRunNavigatorProps = {
  runs: ScenarioRunSummary[]
  loading: boolean
  selectedId?: string
  onSelect: (runId: string) => void
}

export const ScenarioRunNavigator: React.FC<ScenarioRunNavigatorProps> = ({
  runs,
  loading,
  selectedId,
  onSelect,
}) => (
  <ScrollArea style={{ height: '100%' }} data-testid="scenario-run-navigator">
    <Stack gap={2} p="xs">
      {loading && (
        <Center p="md">
          <Loader size="sm" />
        </Center>
      )}
      {!loading && runs.length === 0 && (
        <Text size="sm" c="dimmed" p="sm">
          {m.scenario_runs_none()}
        </Text>
      )}
      {runs.map((run) => (
        <ScenarioRunRow
          key={run.runId}
          run={run}
          selected={run.runId === selectedId}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  </ScrollArea>
)
