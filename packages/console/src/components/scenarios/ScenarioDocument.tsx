import React, { useMemo } from 'react'
import { Box, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { ScenarioSection } from './ScenarioSection'
import { useScenarioDocs } from '../../hooks/useScenarioDocs'
import { useScenarioPersonaEntries } from '../../hooks/useScenarioEntries'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import type { PersonaEntry } from '../personas/persona-types'

type ScenarioDocumentProps = {
  /** The scenario's workflow name — how it is addressed everywhere else. */
  scenarioName: string
}

/**
 * One scenario, read the way the scenarios page reads it.
 *
 * A scenario reached through the workflow surface is the same declaration as
 * the one in its feature document, so it gets the same rendering: the ladder of
 * given/when/then in the author's own sentences, the cast, the examples. It
 * used to arrive here as a second, timeline-shaped drawing of the graph, which
 * said less about the scenario than its own prose does and had to be kept in
 * step with the reading surface by hand.
 */
export const ScenarioDocument: React.FC<ScenarioDocumentProps> = ({
  scenarioName,
}) => {
  const { allFeatures } = useScenarioDocs(m.scenarios_ungrouped())
  const { personas } = useScenarioPersonaEntries()
  const { meta } = usePikkuMeta()
  const { openWorkflowStep, openPersona } = usePanelContext()

  // Every entry naming this scenario is one of its `Examples:` rows, so they are
  // gathered rather than picked from — the same collapse the feature makes.
  const section = useMemo(() => {
    for (const feature of allFeatures) {
      const entries = feature.scenarios.filter(
        (entry) => entry.scenario.name === scenarioName
      )
      const first = entries[0]
      if (!first) continue
      return {
        scenario: first.scenario,
        examples: entries
          .map((entry) => entry.data)
          .filter((data) => data !== undefined),
      }
    }
    return undefined
  }, [allFeatures, scenarioName])

  const byKey = useMemo(
    () => new Map(personas.map((persona) => [persona.key, persona])),
    [personas]
  )

  if (!section) {
    return (
      <Box px="md">
        <Text size="sm" c="dimmed" fs="italic">
          {m.scenarios_no_steps()}
        </Text>
      </Box>
    )
  }

  const showPersona = (key: string) => {
    const persona = byKey.get(key)
    if (persona) openPersona(key, persona.name, { persona })
  }

  return (
    <ScenarioSection
      scenario={section.scenario}
      examples={section.examples}
      cast={section.scenario.actors
        .map((key) => byKey.get(key))
        .filter((persona): persona is PersonaEntry => Boolean(persona))}
      workflow={(meta.workflows as Record<string, unknown>)?.[scenarioName]}
      onOpenPersona={showPersona}
      onSelectStep={(_workflow, stepId, stepType, metadata) =>
        openWorkflowStep(stepId, stepType, { ...metadata, stepType })
      }
    />
  )
}
