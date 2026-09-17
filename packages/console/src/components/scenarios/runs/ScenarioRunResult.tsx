import React, { useState } from 'react'
import {
  Badge,
  Box,
  Code,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Check, ChevronDown, ChevronRight, Minus, X } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { ScenarioResult } from '@pikku/core/scenario'
import { ScenarioRunSteps } from './ScenarioRunSteps'
import { ScenarioRunPlayer } from './ScenarioRunPlayer'
import { ScenarioArtifactTile } from './ScenarioArtifactTile'
import { runDuration, stepOffsets } from './scenario-run-format'

const RESULT_ICON = {
  passed: { Icon: Check, colour: 'var(--mantine-color-green-6)' },
  failed: { Icon: X, colour: 'var(--mantine-color-red-6)' },
  skipped: { Icon: Minus, colour: 'var(--mantine-color-dimmed)' },
}

type ScenarioRunResultProps = {
  runId: string
  result: ScenarioResult
  open: boolean
  onToggle: () => void
}

/**
 * One scenario within a run: what it was called, how it went, the ladder it
 * walked, why it stopped if it did, and everything it recorded on the way.
 *
 * Closed it is a single row, because a run of forty scenarios is a list to scan
 * and only one of them is ever the one you came for. Open, the ladder and the
 * recording sit side by side on a shared clock.
 */
export const ScenarioRunResult: React.FC<ScenarioRunResultProps> = ({
  runId,
  result,
  open,
  onToggle,
}) => {
  const [activeStep, setActiveStep] = useState<number>()
  const failed = result.status === 'failed'
  const artifacts = result.artifacts ?? []
  const recording = artifacts.find((artifact) => artifact.kind === 'video')
  const stills = artifacts.filter((artifact) => artifact.kind !== 'video')
  const steps = result.steps ?? []
  const offsets = stepOffsets(steps)
  const icon =
    RESULT_ICON[result.status as keyof typeof RESULT_ICON] ??
    RESULT_ICON.skipped
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <Paper
      withBorder
      radius="md"
      data-testid={`scenario-run-result-${result.name}`}
    >
      <UnstyledButton
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`scenario-run-result-toggle-${result.name}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--mantine-spacing-xs)',
          width: '100%',
          minHeight: 44,
          padding: '0 var(--mantine-spacing-md)',
        }}
      >
        <Chevron size={14} color="var(--mantine-color-dimmed)" />
        <icon.Icon size={14} strokeWidth={2.4} color={icon.colour} />
        <Text size="sm" fw={600} style={{ textAlign: 'start' }}>
          {asI18n(result.name)}
        </Text>
        {result.feature && (
          <Text size="xs" c="dimmed" style={{ textAlign: 'start' }}>
            {asI18n(result.feature)}
          </Text>
        )}
        <Box style={{ flex: 1 }} />
        {(result.tags ?? []).map((tag) => (
          <Badge key={tag} variant="light" size="xs" radius="xl" tt="none">
            {asI18n(tag)}
          </Badge>
        ))}
        <Text size="xs" c="dimmed" ff="monospace">
          {asI18n(runDuration(result.durationMs))}
        </Text>
      </UnstyledButton>

      {open && (
        <Group
          align="flex-start"
          wrap="nowrap"
          gap="md"
          p="md"
          pt={0}
          style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
        >
          <Stack gap="sm" pt="md" style={{ flex: 1, minWidth: 0 }}>
            <ScenarioRunSteps
              steps={steps}
              activeIndex={activeStep}
              onSelect={setActiveStep}
            />

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

            {stills.length > 0 && (
              <Group gap="md" align="flex-start" wrap="wrap">
                {stills.map((artifact) => (
                  <ScenarioArtifactTile
                    key={artifact.path}
                    runId={runId}
                    artifact={artifact}
                  />
                ))}
              </Group>
            )}
          </Stack>

          {recording && (
            <Box pt="md" style={{ width: 380, flexShrink: 0 }}>
              <ScenarioRunPlayer
                runId={runId}
                artifact={recording}
                seekMs={
                  activeStep === undefined ? undefined : offsets[activeStep]
                }
              />
            </Box>
          )}
        </Group>
      )}
    </Paper>
  )
}
