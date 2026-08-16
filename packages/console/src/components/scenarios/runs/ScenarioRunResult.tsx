import React from 'react'
import { Badge, Code, Group, Paper, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioResult } from '@pikku/core/scenario'
import { ScenarioRunSteps } from './ScenarioRunSteps'
import { ScenarioArtifactTile } from './ScenarioArtifactTile'
import { runDuration } from './scenario-run-format'

type ScenarioRunResultProps = {
  runId: string
  result: ScenarioResult
}

/**
 * One scenario within a run: what it was called, how it went, the ladder it
 * walked, why it stopped if it did, and everything it recorded on the way.
 */
export const ScenarioRunResult: React.FC<ScenarioRunResultProps> = ({
  runId,
  result,
}) => {
  const failed = result.status === 'failed'
  const artifacts = result.artifacts ?? []

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      data-testid={`scenario-run-result-${result.name}`}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={600}>
              {asI18n(result.name)}
            </Text>
            {result.feature && (
              <Text size="xs" c="dimmed">
                {asI18n(result.feature)}
              </Text>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            {(result.tags ?? []).map((tag) => (
              <Badge key={tag} variant="light" size="xs" radius="xl" tt="none">
                {asI18n(tag)}
              </Badge>
            ))}
            <Text size="xs" c="dimmed" ff="monospace">
              {asI18n(runDuration(result.durationMs))}
            </Text>
          </Group>
        </Group>

        <ScenarioRunSteps steps={result.steps ?? []} />

        {failed && (
          <Stack gap={4}>
            {result.failure?.sentence && (
              <Text size="sm" c="red" fw={500}>
                {asI18n(result.failure.sentence)}
              </Text>
            )}
            <Code block color="red">
              {result.failure?.message ??
                result.error ??
                m.scenario_runs_unknown_failure()}
            </Code>
            {result.failure?.stack && !result.failure.expected && (
              <Code block>{result.failure.stack}</Code>
            )}
          </Stack>
        )}

        {artifacts.length > 0 && (
          <Group gap="md" align="flex-start" wrap="wrap">
            {artifacts.map((artifact) => (
              <ScenarioArtifactTile
                key={artifact.path}
                runId={runId}
                artifact={artifact}
              />
            ))}
          </Group>
        )}
      </Stack>
    </Paper>
  )
}
