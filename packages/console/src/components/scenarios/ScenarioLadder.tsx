import React from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { LadderStep } from './LadderStep'
import type { ScenarioLadderStep } from './scenario-doc-model'

type ScenarioLadderProps = {
  steps: ScenarioLadderStep[]
  /** Display names for the actors the steps name, keyed by actor key. */
  actorNames?: Map<string, string>
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
          actorName={step.actor ? actorNames?.get(step.actor) : undefined}
          onOpenPersona={onOpenPersona}
          onSelectStep={onSelectStep}
        />
      ))}
    </Stack>
  )
}
