import React, { useState } from 'react'
import {
  Alert,
  Button,
  Center,
  Code,
  Group,
  ScrollArea,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Trash2 } from 'lucide-react'
import { m } from '@/i18n/messages'
import {
  useDeleteScenarioRun,
  useScenarioRun,
} from '../../../hooks/useScenarioRuns'
import { ScenarioRunStatusBadge } from './ScenarioRunStatusBadge'
import { ScenarioRunResult } from './ScenarioRunResult'
import { ScenarioRunTimeline } from './ScenarioRunTimeline'
import { runDuration, runRelativeTime } from './scenario-run-format'
import { ConsoleLoading } from '../../ui/ConsoleLoading'

type ScenarioRunDetailProps = {
  runId: string
  onDeleted: () => void
}

/**
 * A whole run, read back from its snapshot. Nothing here is looked up against
 * the current suite — the run is the record of what it was when it ran.
 */
export const ScenarioRunDetail: React.FC<ScenarioRunDetailProps> = ({
  runId,
  onDeleted,
}) => {
  const { data: run, isLoading } = useScenarioRun(runId)
  const remove = useDeleteScenarioRun()
  const [opened, setOpened] = useState<string>()

  if (isLoading) {
    return <ConsoleLoading />
  }

  if (!run) {
    return (
      <Center p="xl">
        <Text size="sm" c="dimmed">
          {m.scenario_runs_gone()}
        </Text>
      </Center>
    )
  }

  const firstFailure = run.results.find((result) => result.status === 'failed')
  const openName = opened ?? firstFailure?.name ?? run.results[0]?.name
  const toggle = (name: string) => setOpened(name === openName ? '' : name)

  const features: { feature: string; results: typeof run.results }[] = []
  for (const result of run.results) {
    const feature = result.feature ?? ''
    const last = features[features.length - 1]
    if (last && last.feature === feature) last.results.push(result)
    else features.push({ feature, results: [result] })
  }

  const elapsed =
    run.finishedAt &&
    new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()

  return (
    <ScrollArea style={{ height: '100%' }} data-testid="scenario-run-detail">
      <Stack gap="md" p="md">
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
          </Group>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            leftSection={<Trash2 size={13} />}
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(run.runId, { onSuccess: () => onDeleted() })
            }
            data-testid="scenario-run-delete"
          >
            {m.scenario_runs_delete()}
          </Button>
        </Group>

        {run.hookFailures.length > 0 && (
          <Alert color="red" title={m.scenario_runs_hook_failures()}>
            <Stack gap={4}>
              {run.hookFailures.map((failure) => (
                <Code key={failure} block>
                  {failure}
                </Code>
              ))}
            </Stack>
          </Alert>
        )}

        <ScenarioRunTimeline
          results={run.results}
          openName={openName}
          onOpen={toggle}
        />

        <Stack gap="lg">
          {features.map((group) => (
            <Stack key={group.feature} gap={6}>
              {group.feature && (
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  {asI18n(group.feature)}
                </Text>
              )}
              {group.results.map((result) => (
                <ScenarioRunResult
                  key={result.name}
                  runId={run.runId}
                  result={result}
                  open={result.name === openName}
                  onToggle={() => toggle(result.name)}
                />
              ))}
            </Stack>
          ))}
        </Stack>

        {run.skipped.length > 0 && (
          <Stack gap={4}>
            <Text size="sm" fw={600} c="dimmed">
              {m.scenario_runs_skipped()}
            </Text>
            {run.skipped.map((skip) => (
              <Text key={skip.name} size="sm" c="dimmed">
                {m.scenario_runs_skipped_entry({
                  name: skip.name,
                  reason: skip.reason,
                })}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </ScrollArea>
  )
}
