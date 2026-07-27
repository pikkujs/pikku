import React, { useMemo } from 'react'
import { Badge, Box, Divider, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { FeatureHooksNote } from './FeatureHooksNote'
import { ScenarioSection } from './ScenarioSection'
import { useScenarioPersonaEntries } from '../../hooks/useScenarioEntries'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import type { PersonaEntry } from '../personas/persona-types'
import type { FeatureDoc, ScenarioDoc } from './scenario-doc-model'

interface SectionModel {
  scenario: ScenarioDoc
  examples: unknown[]
}

/**
 * Entries repeating the same scenario are the `Examples:` of one section, not
 * repeated sections — so they collapse into a single reading with a table.
 */
const toSections = (feature: FeatureDoc): SectionModel[] => {
  const sections: SectionModel[] = []
  const byName = new Map<string, SectionModel>()

  for (const entry of feature.scenarios) {
    const existing = byName.get(entry.scenario.name)
    if (existing) {
      if (entry.data !== undefined) existing.examples.push(entry.data)
      continue
    }
    const section: SectionModel = {
      scenario: entry.scenario,
      examples: entry.data === undefined ? [] : [entry.data],
    }
    byName.set(entry.scenario.name, section)
    sections.push(section)
  }

  return sections
}

type FeatureDocumentProps = {
  feature: FeatureDoc
  onOpenScenario?: (name: string) => void
  onOpenPersona?: (key: string) => void
  onSelectStep?: (workflow: unknown, stepId: string, stepType: string) => void
}

export const FeatureDocument: React.FC<FeatureDocumentProps> = ({
  feature,
  onOpenScenario,
  onOpenPersona,
  onSelectStep,
}) => {
  const sections = useMemo(() => toSections(feature), [feature])
  const { personas } = useScenarioPersonaEntries()
  const { meta } = usePikkuMeta()
  const byKey = useMemo(
    () => new Map(personas.map((persona) => [persona.key, persona])),
    [personas]
  )

  return (
    <Box
      data-testid={`feature-document-${feature.id}`}
      style={{ maxWidth: 860, padding: '28px 32px 64px' }}
    >
      <Stack gap="lg">
        <Stack gap={8}>
          <Text fw={700} size="xl" style={{ lineHeight: 1.25 }}>
            {asI18n(feature.name)}
          </Text>
          {feature.description && (
            <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
              {asI18n(feature.description)}
            </Text>
          )}
          <Group gap={6}>
            <Text size="xs" c="dimmed" ff="monospace">
              {sections.length === 1
                ? m.scenarios_scenario_count_one()
                : m.scenarios_scenario_count({ count: sections.length })}
            </Text>
            {feature.tags.map((tag) => (
              <Badge key={tag} size="xs" variant="light" radius="sm" tt="none">
                {asI18n(tag)}
              </Badge>
            ))}
          </Group>
        </Stack>

        <FeatureHooksNote
          hasBefore={feature.hasBefore}
          hasAfter={feature.hasAfter}
        />

        {feature.unresolvedEntries > 0 && (
          <Text size="xs" c="dimmed" fs="italic" data-testid="feature-partial">
            {m.scenarios_partial_listing({
              count: feature.unresolvedEntries,
            })}
          </Text>
        )}

        <Divider />

        <Stack gap="xl">
          {sections.map((section) => (
            <ScenarioSection
              key={section.scenario.name}
              scenario={section.scenario}
              examples={section.examples}
              cast={section.scenario.actors
                .map((key) => byKey.get(key))
                .filter((persona): persona is PersonaEntry => Boolean(persona))}
              workflow={
                (meta.workflows as Record<string, unknown>)?.[
                  section.scenario.name
                ]
              }
              onOpen={onOpenScenario}
              onOpenPersona={onOpenPersona}
              onSelectStep={onSelectStep}
            />
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}
