import React from 'react'
import { Button, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Trash2 } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { ScenarioRunRecord } from '@pikku/core/scenario'
import { ScenarioRunStatusBadge } from './ScenarioRunStatusBadge'
import { ScenarioRunTimeline } from './ScenarioRunTimeline'
import { runDuration, runRelativeTime } from './scenario-run-format'

type ScenarioRunBandProps = {
  run: ScenarioRunRecord
  /** How many scenarios the suite declares, so a live run can say how far it is. */
  declared: number
  onOpenScenario: (scenarioName: string) => void
  onDelete: () => void
  deleting: boolean
}

/**
 * The chosen run, stated once above the suite it is being read over: what it
 * was, how it went, and where its time went. Everything below is the suite —
 * this band is the only place the run speaks for itself.
 */
export const ScenarioRunBand: React.FC<ScenarioRunBandProps> = ({
  run,
  declared,
  onOpenScenario,
  onDelete,
  deleting,
}) => {
  const elapsed =
    run.finishedAt &&
    new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
  const settled = run.results.filter(
    (result) => result.status !== 'running'
  ).length

  return (
    <Stack gap={8} data-testid="scenario-run-band">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="sm" wrap="wrap">
          <ScenarioRunStatusBadge status={run.status} />
          <Text size="sm" fw={600}>
            {m.scenario_runs_header({
              environment: run.environment,
              surface: run.surface,
            })}
          </Text>
          <Text size="xs" c="dimmed">
            {asI18n(
              elapsed
                ? `${runRelativeTime(run.startedAt)} · ${runDuration(elapsed)}`
                : runRelativeTime(run.startedAt)
            )}
          </Text>
          {run.status === 'running' && declared > 0 && (
            <Text size="xs" c="dimmed" ff="monospace">
              {m.scenarios_run_progress({ done: settled, total: declared })}
            </Text>
          )}
        </Group>
        <Button
          size="xs"
          variant="subtle"
          color="red"
          leftSection={<Trash2 size={13} />}
          loading={deleting}
          onClick={onDelete}
          data-testid="scenario-run-delete"
        >
          {m.scenario_runs_delete()}
        </Button>
      </Group>

      <ScenarioRunTimeline
        results={run.results}
        onOpen={(name) => {
          const result = run.results.find((entry) => entry.name === name)
          onOpenScenario(result?.scenarioName ?? name)
        }}
      />

      {run.hookFailures.length > 0 && (
        <Stack gap={2}>
          <Text size="xs" fw={600} c="red">
            {m.scenario_runs_hook_failures()}
          </Text>
          {run.hookFailures.map((failure) => (
            <Text key={failure} size="xs" c="dimmed">
              {asI18n(failure)}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
