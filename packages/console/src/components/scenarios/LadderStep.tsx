import React from 'react'
import { Anchor, Box, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import classes from './scenarios.module.css'
import type { ScenarioLadderStep } from './scenario-doc-model'

const PHASE_LABEL: Record<string, () => string> = {
  given: () => m.scenarios_phase_given(),
  when: () => m.scenarios_phase_when(),
  then: () => m.scenarios_phase_then(),
}

type LadderStepProps = {
  step: ScenarioLadderStep
  /** True when the step above declared the same phase — gherkin's `And`. */
  continuation: boolean
  /** The actor's display name, when the project configures one. */
  actorName?: string
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
  actorName,
  onOpenPersona,
  onSelectStep,
}) => {
  const label = PHASE_LABEL[step.phase]?.()
  const actor = step.actor

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
      <Box style={{ width: 52, flexShrink: 0, textAlign: 'right' }}>
        {label && !continuation && !step.repeat && (
          <Text size="sm" fw={600} c="dimmed" style={{ lineHeight: 1.6 }}>
            {asI18n(label)}
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
          {actor ? (
            <Anchor
              component="span"
              fw={600}
              data-testid="ladder-actor"
              data-persona-key={actor}
              className={classes.ladderActor}
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation()
                onOpenPersona?.(actor)
              }}
              style={{
                cursor: onOpenPersona ? 'pointer' : 'default',
                marginRight: 6,
              }}
            >
              {asI18n(actorName ?? actor)}
            </Anchor>
          ) : null}
          <span className={classes.ladderSentence}>
            {asI18n(step.sentence)}
          </span>
        </Text>
      )}
    </Group>
  )
}
