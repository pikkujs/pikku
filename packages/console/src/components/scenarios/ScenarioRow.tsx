import React, { useMemo, useState } from 'react'
import { ActionIcon, Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ListChecks,
  Loader,
  X,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import type { ScenarioResult } from '@pikku/core/scenario'
import { CardRow } from '../ui/CardRow'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import { ScenarioLadder } from './ScenarioLadder'
import { ExamplesTable } from './ExamplesTable'
import { SkipNotice } from './SkipNotice'
import {
  alignLadderToRun,
  stepAtVideoTime,
  stepVideoOffset,
  type ScenarioLensStatus,
} from './scenario-run-lens'
import { ScenarioFailureReport } from './runs/ScenarioFailureReport'
import { ScenarioFootage } from './runs/ScenarioFootage'
import { runDuration } from './runs/scenario-run-format'
import type { ScenarioDoc } from './scenario-doc-model'
import type { PersonaEntry } from '../personas/persona-types'

const LOOK: Record<ScenarioLensStatus, { tone: StatusTone; Icon: typeof Check }> =
  {
    passed: { tone: 'good', Icon: Check },
    failed: { tone: 'bad', Icon: X },
    running: { tone: 'info', Icon: Loader },
    waiting: { tone: 'neutral', Icon: Circle },
    never: { tone: 'neutral', Icon: Circle },
  }

type ScenarioRowProps = {
  scenario: ScenarioDoc
  examples: unknown[]
  cast: PersonaEntry[]
  workflow: unknown
  run?: { runId: string; status: ScenarioLensStatus; result?: ScenarioResult }
  defaultOpen: boolean
  onOpenPersona?: (key: string) => void
  onSelectStep?: (
    workflow: unknown,
    stepId: string,
    stepType: string,
    metadata: Record<string, unknown>
  ) => void
}

export const ScenarioRow: React.FC<ScenarioRowProps> = ({
  scenario,
  examples,
  cast,
  workflow,
  run,
  defaultOpen,
  onOpenPersona,
  onSelectStep,
}) => {
  const [open, setOpen] = useState(defaultOpen)
  const [seekStep, setSeekStep] = useState<{
    stepId: string
    nonce: number
  }>()
  const [playingStep, setPlayingStep] = useState<string>()
  const recorded = useMemo(
    () =>
      run?.result?.steps
        ? alignLadderToRun(scenario.steps, run.result.steps)
        : undefined,
    [run?.result?.steps, scenario.steps]
  )

  const hasFootage = (run?.result?.artifacts?.length ?? 0) > 0
  const look = run ? LOOK[run.status] : undefined
  const Icon = scenario.skip ? Circle : (look?.Icon ?? ListChecks)
  const tone: StatusTone = scenario.skip ? 'neutral' : (look?.tone ?? 'neutral')
  const stepCount = scenario.steps.filter((step) => !step.repeat).length

  const meta: I18nNode[] = [
    stepCount === 1
      ? m.scenarios_row_steps_one()
      : m.scenarios_row_steps({ count: stepCount }),
    ...(cast.length > 0
      ? [m.scenarios_row_as({ names: cast.map((p) => p.name).join(', ') })]
      : []),
    ...(examples.length > 1
      ? [m.scenarios_row_examples({ count: examples.length })]
      : []),
    ...(run?.result && run.result.durationMs > 0
      ? [asI18n(runDuration(run.result.durationMs))]
      : []),
  ]

  const stoppedAt =
    run?.result?.status === 'failed' ? run.result.failure?.sentence : undefined

  return (
    <CardRow
      testId={`scenario-section-${scenario.name}`}
      onClick={() => setOpen((value) => !value)}
      leading={
        <StatusTile tone={tone}>
          <Icon size={18} />
        </StatusTile>
      }
      title={asI18n(scenario.title)}
      badges={
        scenario.skip ? (
          <StatusBadge tone="neutral" size="sm">
            {m.scenarios_status_skipped()}
          </StatusBadge>
        ) : run?.status === 'failed' ? (
          <StatusBadge tone="bad" size="sm">
            {m.scenarios_status_failed()}
          </StatusBadge>
        ) : undefined
      }
      meta={
        stoppedAt
          ? m.scenarios_row_stopped({ sentence: stoppedAt })
          : meta.map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 && asI18n(' · ')}
                {part}
              </React.Fragment>
            ))
      }
      trailing={
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={open ? m.scenarios_row_hide() : m.scenarios_row_show()}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          data-testid="scenario-row-toggle"
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </ActionIcon>
      }
    >
      {open && (
        <Box
          mt="md"
          pl={{ base: 0, sm: 52 }}
          onClick={(event) => event.stopPropagation()}
          style={{ cursor: 'default' }}
        >
          <Group align="flex-start" gap={28} wrap="wrap">
            <Stack gap="md" style={{ flex: '1 1 340px', minWidth: 0 }}>
              {scenario.description && (
                <Text size="sm" c="dimmed" maw={640}>
                  {asI18n(scenario.description)}
                </Text>
              )}
              {scenario.skip && <SkipNotice reason={scenario.skip} />}
              <ScenarioLadder
                steps={scenario.steps}
                actorNames={
                  new Map(cast.map((persona) => [persona.key, persona.name]))
                }
                recorded={recorded}
                onOpenPersona={onOpenPersona}
                onSelectStep={(stepId, stepType, metadata) =>
                  onSelectStep?.(workflow, stepId, stepType, metadata)
                }
                onSeekStep={
                  hasFootage
                    ? (stepId) => {
                        setPlayingStep(stepId)
                        setSeekStep({ stepId, nonce: Date.now() })
                      }
                    : undefined
                }
                activeStepId={hasFootage ? playingStep : undefined}
              />
              {run?.result?.status === 'failed' && (
                <ScenarioFailureReport result={run.result} />
              )}
              {examples.length > 0 && <ExamplesTable rows={examples} />}
            </Stack>
            {run && hasFootage && (
              <Box style={{ flex: '1 1 420px', minWidth: 0 }}>
                <ScenarioFootage
                  runId={run.runId}
                  status={run.status}
                  artifacts={run.result?.artifacts ?? []}
                  seek={seekStep}
                  offsetFor={(stepId, actor) =>
                    stepVideoOffset(scenario.steps, recorded, stepId, actor)
                  }
                  onTime={(ms, actor) => {
                    const stepId = stepAtVideoTime(
                      scenario.steps,
                      recorded,
                      ms,
                      actor
                    )
                    if (stepId) setPlayingStep(stepId)
                  }}
                />
              </Box>
            )}
          </Group>
        </Box>
      )}
    </CardRow>
  )
}
