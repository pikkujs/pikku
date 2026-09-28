import React, { useMemo } from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useScenarioPersonaEntries } from '../../hooks/useScenarioEntries'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { SectionCard } from '../ui/SectionCard'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevField, DevFields } from '../ui/DevDetail'
import { FeatureHooksNote } from './FeatureHooksNote'
import { toSections } from './FeatureDocument'
import { ScenarioRow } from './ScenarioRow'
import type { PersonaEntry } from '../personas/persona-types'
import type { FeatureDoc } from './scenario-doc-model'
import type { ScenarioRunLens } from './scenario-run-lens'

type ScenarioFeatureCardProps = {
  feature: FeatureDoc
  lens?: ScenarioRunLens
  expanded?: boolean
  onOpenPersona?: (key: string) => void
  onSelectStep?: (
    workflow: unknown,
    stepId: string,
    stepType: string,
    metadata: Record<string, unknown>
  ) => void
}

const FeatureTally: React.FC<{ feature: FeatureDoc; lens: ScenarioRunLens }> = ({
  feature,
  lens,
}) => {
  const tally = lens.tally(feature)
  if (tally.failed > 0)
    return (
      <StatusBadge tone="bad">
        {m.scenarios_feature_failed({ count: tally.failed })}
      </StatusBadge>
    )
  if (tally.running > 0 || tally.waiting > 0)
    return <StatusBadge tone="info">{m.scenarios_status_running()}</StatusBadge>
  if (tally.passed > 0 && tally.never === 0)
    return <StatusBadge tone="good">{m.scenarios_feature_passed()}</StatusBadge>
  if (tally.passed > 0)
    return (
      <StatusBadge tone="neutral">
        {m.scenarios_feature_partly_run({
          done: tally.passed,
          total: tally.passed + tally.never,
        })}
      </StatusBadge>
    )
  return <StatusBadge tone="neutral">{m.scenarios_status_never()}</StatusBadge>
}

export const ScenarioFeatureCard: React.FC<ScenarioFeatureCardProps> = ({
  feature,
  lens,
  expanded,
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
    <SectionCard
      testId={`feature-document-${feature.id}`}
      title={asI18n(feature.name)}
      subtitle={
        sections.length === 1
          ? m.scenarios_scenario_count_one()
          : m.scenarios_scenario_count({ count: sections.length })
      }
      blurb={feature.description ? asI18n(feature.description) : undefined}
      right={lens ? <FeatureTally feature={feature} lens={lens} /> : undefined}
    >
      <Stack gap="xs" mt="md">
        {sections.map((section) => {
          const status = lens?.statusFor(section.scenario)
          return (
            <ScenarioRow
              key={`${lens?.runId ?? ''}${section.scenario.name}`}
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
              run={
                lens && status
                  ? {
                      runId: lens.runId,
                      status,
                      result: lens.resultFor(section.scenario),
                    }
                  : undefined
              }
              defaultOpen={Boolean(expanded) || status === 'failed'}
              onOpenPersona={onOpenPersona}
              onSelectStep={onSelectStep}
            />
          )
        })}
        <ForDevelopers
          label={m.scenarios_dev_label()}
          hint={m.scenarios_dev_hint()}
          testId={`feature-developers-${feature.id}`}
        >
          <DevFields>
            {feature.tags.length > 0 && (
              <DevField
                label={m.scenarios_dev_tags()}
                value={feature.tags.join(' ')}
              />
            )}
            <DevField label={m.dev_id()} value={feature.id} />
            {sections.length > 0 && (
              <DevField
                label={m.dev_workflows()}
                value={sections
                  .map((section) => section.scenario.name)
                  .join(', ')}
              />
            )}
          </DevFields>
          <FeatureHooksNote
            hasBefore={feature.hasBefore}
            hasAfter={feature.hasAfter}
          />
          {feature.unresolvedEntries > 0 && (
            <Text size="sm" c="dimmed" data-testid="feature-partial">
              {m.scenarios_partial_listing({
                count: feature.unresolvedEntries,
              })}
            </Text>
          )}
        </ForDevelopers>
      </Stack>
    </SectionCard>
  )
}
