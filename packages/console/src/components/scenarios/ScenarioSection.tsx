import React, { useMemo, useState } from 'react'
import { Anchor, Badge, Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { ScenarioLadder } from './ScenarioLadder'
import { ExamplesTable } from './ExamplesTable'
import { SkipNotice } from './SkipNotice'
import { ScenarioRunPill } from './ScenarioRunPill'
import { ScenarioCast } from './ScenarioCast'
import {
  ScenarioStatusMark,
  SCENARIO_STATUS_COLOUR,
} from './ScenarioStatusMark'
import {
  alignLadderToRun,
  ladderOffset,
  type ScenarioLensStatus,
} from './scenario-run-lens'
import { ScenarioFailureReport } from './runs/ScenarioFailureReport'
import { ScenarioRunPlayer } from './runs/ScenarioRunPlayer'
import { ScenarioArtifactTile } from './runs/ScenarioArtifactTile'
import { runDuration } from './runs/scenario-run-format'
import type { ScenarioResult } from '@pikku/core/scenario'
import type { ScenarioDoc } from './scenario-doc-model'
import type { PersonaEntry } from '../personas/persona-types'

type ScenarioSectionProps = {
  scenario: ScenarioDoc
  /** `Examples:` rows, when a feature parameterises this scenario. */
  examples: unknown[]
  /** The personas this scenario casts, resolved from the actor config. */
  cast: PersonaEntry[]
  /**
   * The scenario's own workflow meta. A step's details panel reads the node out
   * of here, so it is handed back up with every step selection.
   */
  workflow: unknown
  /**
   * The run being read, when one is selected. `undefined` means the suite is
   * being read as written, and nothing is claimed about how it went.
   */
  run?: { runId: string; status: ScenarioLensStatus; result?: ScenarioResult }
  /**
   * True when the whole suite is on screen. Each recording is pulled into
   * memory to carry the console's Authorization header, so a failing run read
   * across every feature would fetch its whole artifact store at once — the
   * footage waits until the reader narrows to one feature.
   */
  scanning?: boolean
  onOpenPersona?: (key: string) => void
  onSelectStep?: (
    workflow: unknown,
    stepId: string,
    stepType: string,
    metadata: Record<string, unknown>
  ) => void
}

export const ScenarioSection: React.FC<ScenarioSectionProps> = ({
  scenario,
  examples,
  cast,
  workflow,
  run,
  scanning,
  onOpenPersona,
  onSelectStep,
}) => {
  const [seekStep, setSeekStep] = useState<string>()
  const recorded = useMemo(
    () =>
      run?.result?.steps
        ? alignLadderToRun(scenario.steps, run.result.steps)
        : undefined,
    [run?.result?.steps, scenario.steps]
  )
  const [revealed, setRevealed] = useState(false)
  const artifacts = run?.result?.artifacts ?? []
  const recordings = artifacts.filter((artifact) => artifact.kind === 'video')
  const stills = artifacts.filter((artifact) => artifact.kind !== 'video')
  const hasFootage = recordings.length > 0 || stills.length > 0
  const showFootage =
    hasFootage && (revealed || (!scanning && run?.result?.status === 'failed'))

  return (
    <Box
      component="section"
      data-testid={`scenario-section-${scenario.name}`}
      style={{
        borderLeft: `${run ? 3 : 2}px solid ${
          run
            ? SCENARIO_STATUS_COLOUR[run.status]
            : 'var(--mantine-color-default-border)'
        }`,
        paddingLeft: 20,
        opacity: scenario.skip ? 0.6 : 1,
      }}
    >
      <Stack gap={10}>
        <Group gap="sm" align="baseline" wrap="nowrap">
          {run && (
            <Box style={{ alignSelf: 'center' }}>
              <ScenarioStatusMark status={run.status} />
            </Box>
          )}
          <Text fw={600} size="md" style={{ flex: 1, minWidth: 0 }}>
            {asI18n(scenario.title)}
          </Text>
          {run?.result && run.result.durationMs > 0 && (
            <Text size="xs" c="dimmed" ff="monospace">
              {asI18n(runDuration(run.result.durationMs))}
            </Text>
          )}
          {!run && <ScenarioRunPill scenarioName={scenario.name} />}
        </Group>

        {scenario.description && (
          <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
            {asI18n(scenario.description)}
          </Text>
        )}

        {scenario.tags.length > 0 && (
          <Group gap={6}>
            {scenario.tags.map((tag) => (
              <Badge
                key={tag}
                size="xs"
                variant="default"
                radius="sm"
                tt="none"
              >
                {asI18n(tag)}
              </Badge>
            ))}
          </Group>
        )}

        {scenario.skip && <SkipNotice reason={scenario.skip} />}

        <ScenarioCast cast={cast} onOpenPersona={onOpenPersona} />

        <Group align="flex-start" gap="lg" wrap="wrap">
          <Stack gap={10} style={{ flex: '1 1 380px', minWidth: 0 }}>
            <ScenarioLadder
              steps={scenario.steps}
              actorNames={
                new Map(cast.map((persona) => [persona.key, persona.name]))
              }
              recorded={recorded}
              onOpenPersona={onOpenPersona}
              onSelectStep={(stepId, stepType, metadata) => {
                setSeekStep(stepId)
                onSelectStep?.(workflow, stepId, stepType, metadata)
              }}
            />

            {run?.result?.status === 'failed' && (
              <ScenarioFailureReport result={run.result} />
            )}

            {run && hasFootage && !showFootage && (
              <Anchor
                component="button"
                type="button"
                size="xs"
                onClick={() => setRevealed(true)}
                style={{ alignSelf: 'flex-start' }}
              >
                {m.scenarios_show_footage()}
              </Anchor>
            )}
          </Stack>

          {run && showFootage && (
            <Stack
              gap="sm"
              style={{ flex: '0 1 340px', minWidth: 240, maxWidth: 380 }}
            >
              {recordings.map((artifact) => (
                <ScenarioRunPlayer
                  key={artifact.path}
                  runId={run.runId}
                  artifact={artifact}
                  seekMs={
                    seekStep === undefined
                      ? undefined
                      : ladderOffset(scenario.steps, recorded, seekStep)
                  }
                />
              ))}
              {stills.map((artifact) => (
                <ScenarioArtifactTile
                  key={artifact.path}
                  runId={run.runId}
                  artifact={artifact}
                />
              ))}
            </Stack>
          )}
        </Group>

        {examples.length > 0 && <ExamplesTable rows={examples} />}
      </Stack>
    </Box>
  )
}
