import React from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { LadderStep } from './LadderStep'
import type { ScenarioStepRow } from '@pikku/core/scenario'
import type { ScenarioLadderStep } from './scenario-doc-model'

type ScenarioLadderProps = {
  steps: ScenarioLadderStep[]
  /** Display names for the actors the steps name, keyed by actor key. */
  actorNames?: Map<string, string>
  /** What the selected run recorded for each rung, keyed by ladder step id. */
  recorded?: Map<string, ScenarioStepRow>
  onOpenPersona?: (key: string) => void
  onSelectStep?: (
    stepId: string,
    stepType: string,
    metadata: Record<string, unknown>
  ) => void
}

export const ScenarioLadder: React.FC<ScenarioLadderProps> = ({
  steps,
  actorNames,
  recorded,
  onOpenPersona,
  onSelectStep,
}) => {
  if (steps.length === 0) {
    return (
      <Text size="sm" c="dimmed" fs="italic">
        {m.scenarios_no_steps()}
      </Text>
    )
  }

  return (
    <Stack gap={6}>
      {steps.map((step, index) => (
        <LadderStep
          key={step.id}
          step={step}
          continuation={steps[index - 1]?.phase === step.phase}
          continuesActor={steps[index - 1]?.actor === step.actor}
          actorName={step.actor ? actorNames?.get(step.actor) : undefined}
          recorded={recorded?.get(step.id)}
          marked={Boolean(recorded && recorded.size > 0)}
          onOpenPersona={onOpenPersona}
          onSelectStep={onSelectStep}
        />
      ))}
    </Stack>
  )
}
