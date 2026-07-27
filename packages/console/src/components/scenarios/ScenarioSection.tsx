import React from 'react'
import { Badge, Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { ScenarioLadder } from './ScenarioLadder'
import { ExamplesTable } from './ExamplesTable'
import { SkipNotice } from './SkipNotice'
import { ScenarioRunPill } from './ScenarioRunPill'
import { ScenarioCast } from './ScenarioCast'
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
  onOpen?: (name: string) => void
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
  onOpen,
  onOpenPersona,
  onSelectStep,
}) => (
  <Box
    component="section"
    data-testid={`scenario-section-${scenario.name}`}
    style={{
      borderLeft: '2px solid var(--mantine-color-default-border)',
      paddingLeft: 20,
      opacity: scenario.skip ? 0.6 : 1,
    }}
  >
    <Stack gap={10}>
      <Group gap="sm" align="baseline" wrap="nowrap">
        <Text
          fw={600}
          size="md"
          style={{
            flex: 1,
            minWidth: 0,
            cursor: onOpen ? 'pointer' : 'default',
          }}
          onClick={onOpen ? () => onOpen(scenario.name) : undefined}
        >
          {asI18n(scenario.title)}
        </Text>
        <ScenarioRunPill scenarioName={scenario.name} />
      </Group>

      {scenario.description && (
        <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
          {asI18n(scenario.description)}
        </Text>
      )}

      {scenario.tags.length > 0 && (
        <Group gap={6}>
          {scenario.tags.map((tag) => (
            <Badge key={tag} size="xs" variant="default" radius="sm" tt="none">
              {asI18n(tag)}
            </Badge>
          ))}
        </Group>
      )}

      {scenario.skip && <SkipNotice reason={scenario.skip} />}

      <ScenarioCast cast={cast} onOpenPersona={onOpenPersona} />

      <ScenarioLadder
        steps={scenario.steps}
        actorNames={new Map(cast.map((persona) => [persona.key, persona.name]))}
        onOpenPersona={onOpenPersona}
        onSelectStep={(stepId, stepType, metadata) =>
          onSelectStep?.(workflow, stepId, stepType, metadata)
        }
      />

      {examples.length > 0 && <ExamplesTable rows={examples} />}
    </Stack>
  </Box>
)
