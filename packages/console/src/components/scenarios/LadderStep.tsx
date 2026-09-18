import React from 'react'
import { Anchor, Box, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { Check, Circle, Minus, X } from 'lucide-react'
import classes from './scenarios.module.css'
import { runDuration } from './runs/scenario-run-format'
import type { ScenarioStepRow } from '@pikku/core/scenario'
import type { ScenarioLadderStep } from './scenario-doc-model'

/** A step carries the workflow vocabulary (`succeeded`), not the scenario's. */
const STEP_ICON = {
  succeeded: { Icon: Check, colour: 'var(--mantine-color-green-6)' },
  passed: { Icon: Check, colour: 'var(--mantine-color-green-6)' },
  failed: { Icon: X, colour: 'var(--mantine-color-red-6)' },
  skipped: { Icon: Minus, colour: 'var(--mantine-color-dimmed)' },
}

/** The run is being read and this rung is not in it: it has not run. */
const STEP_PENDING = {
  Icon: Circle,
  colour: 'var(--mantine-color-default-border)',
}

const PHASE_LABEL: Record<string, () => string> = {
  given: () => m.scenarios_phase_given(),
  when: () => m.scenarios_phase_when(),
  then: () => m.scenarios_phase_then(),
}

type LadderStepProps = {
  step: ScenarioLadderStep
  /** True when the step above declared the same phase — gherkin's `And`. */
  continuation: boolean
  /** True when the step above named the same actor, so the subject carries over. */
  continuesActor?: boolean
  /** The actor's display name, when the project configures one. */
  actorName?: string
  /** What the selected run recorded for this rung, when a run is being read. */
  recorded?: ScenarioStepRow
  /** True when this scenario is being read through a run, so every rung reserves the gutter. */
  marked?: boolean
  onOpenPersona?: (key: string) => void
  /** Opens the step's details panel; the page owns which workflow it reads. */
  onSelectStep?: (
    stepId: string,
    stepType: string,
    metadata: Record<string, unknown>
  ) => void
}

export const LadderStep: React.FC<LadderStepProps> = ({
  step,
  continuation,
  continuesActor,
  actorName,
  recorded,
  marked,
  onOpenPersona,
  onSelectStep,
}) => {
  const label = PHASE_LABEL[step.phase]?.()
  const carried = continuation && continuesActor === true
  const actor = step.actor
  const subject = carried ? undefined : actor
  const icon = recorded
    ? (STEP_ICON[recorded.status as keyof typeof STEP_ICON] ??
      STEP_ICON.skipped)
    : STEP_PENDING

  return (
    <Group
      gap="sm"
      align="flex-start"
      wrap="nowrap"
      data-testid={`ladder-step-${step.id}`}
      onClick={() =>
        onSelectStep?.(
          step.id,
          step.repeat ? 'fanout' : 'scenarioStep',
          step.repeat
            ? { stepName: step.id }
            : {
                stepName: step.sentence,
                phase: step.phase,
                actor,
                actorName,
              }
        )
      }
      className={classes.ladderStep}
      style={{ paddingLeft: 8 + step.depth * 24 }}
    >
      {marked && (
        <Box
          style={{
            width: 14,
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            paddingTop: icon === STEP_PENDING ? 7 : 5,
          }}
        >
          <icon.Icon
            size={icon === STEP_PENDING ? 9 : 13}
            strokeWidth={2.4}
            color={icon.colour}
          />
        </Box>
      )}
      <Box style={{ width: 52, flexShrink: 0, textAlign: 'right' }}>
        {label && !step.repeat && (
          <Text size="sm" fw={600} c="dimmed" style={{ lineHeight: 1.6 }}>
            {continuation ? m.scenarios_phase_and() : asI18n(label)}
          </Text>
        )}
      </Box>
      {step.repeat ? (
        <Text size="sm" c="dimmed" fs="italic" style={{ lineHeight: 1.6 }}>
          <span className={classes.ladderSentence}>
            {m.scenarios_repeat({
              item: step.repeat.itemVar,
              source: step.repeat.sourceVar,
            })}
          </span>
        </Text>
      ) : (
        <Text size="sm" style={{ lineHeight: 1.6 }}>
          {subject ? (
            <Anchor
              component="span"
              fw={600}
              data-testid="ladder-actor"
              data-persona-key={subject}
              className={classes.ladderActor}
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation()
                onOpenPersona?.(subject)
              }}
              style={{
                cursor: onOpenPersona ? 'pointer' : 'default',
                marginRight: 6,
              }}
            >
              {asI18n(actorName ?? subject)}
            </Anchor>
          ) : null}
          <span className={classes.ladderSentence}>
            {asI18n(step.sentence)}
          </span>
        </Text>
      )}
      {recorded?.durationMs !== undefined && (
        <Text
          size="xs"
          c="dimmed"
          ff="monospace"
          style={{ paddingTop: 5, marginLeft: 'auto', flexShrink: 0 }}
        >
          {asI18n(runDuration(recorded.durationMs))}
        </Text>
      )}
    </Group>
  )
}
