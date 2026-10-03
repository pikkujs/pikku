import React from 'react'
import {
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { FeatureDoc } from './scenario-doc-model'
import type { ScenarioFeatureTally, ScenarioRunLens } from './scenario-run-lens'

/** The rail's first row: the whole suite, which is where the screen opens. */
export const ALL_FEATURES = '__all__'

const scenarioCount = (count: number) =>
  count === 1
    ? m.scenarios_scenario_count_one()
    : m.scenarios_scenario_count({ count })

const outcome = (
  tally: ScenarioFeatureTally
): { colour: string; label: I18nNode } | undefined => {
  if (tally.failed > 0)
    return { colour: 'red', label: m.scenarios_feature_failed({ count: tally.failed }) }
  if (tally.running > 0 || tally.waiting > 0)
    return { colour: 'blue', label: m.scenarios_status_running() }
  if (tally.passed > 0 && tally.never === 0)
    return { colour: 'green', label: m.scenarios_feature_passed() }
  if (tally.passed > 0)
    return {
      colour: 'dimmed',
      label: m.scenarios_feature_partly_run({
        done: tally.passed,
        total: tally.passed + tally.never,
      }),
    }
  return undefined
}

type FeatureNavigatorProps = {
  features: FeatureDoc[]
  selectedId?: string
  /** The run being read, which is what gives the rows their result bars. */
  lens?: ScenarioRunLens
  onSelect: (id: string) => void
}

export const FeatureNavigator: React.FC<FeatureNavigatorProps> = ({
  features,
  selectedId,
  lens,
  onSelect,
}) => {
  const rows: {
    id: string
    name: I18nNode
    count: number
    tally?: ScenarioFeatureTally
  }[] = [
    {
      id: ALL_FEATURES,
      name: m.scenarios_all_features(),
      count: features.reduce(
        (sum, feature) => sum + feature.scenarios.length,
        0
      ),
      tally: lens
        ? features
            .map((feature) => lens.tally(feature))
            .reduce(
              (total, tally) => ({
                passed: total.passed + tally.passed,
                failed: total.failed + tally.failed,
                running: total.running + tally.running,
                waiting: total.waiting + tally.waiting,
                never: total.never + tally.never,
              }),
              { passed: 0, failed: 0, running: 0, waiting: 0, never: 0 }
            )
        : undefined,
    },
    ...features.map((feature) => ({
      id: feature.id,
      name: asI18n(feature.name),
      count: feature.scenarios.length,
      tally: lens ? lens.tally(feature) : undefined,
    })),
  ]

  return (
    <ScrollArea h="100%" data-testid="feature-navigator">
      <Stack gap={8} p="md">
        {features.length === 0 && (
          <Text size="sm" c="dimmed">
            {m.scenarios_no_features()}
          </Text>
        )}
        {features.length > 0 &&
          rows.map((row) => {
            const selected = row.id === selectedId
            const result = row.tally ? outcome(row.tally) : undefined
            return (
              <UnstyledButton
                key={row.id}
                w="100%"
                data-selected={selected || undefined}
                data-testid={`feature-nav-${row.id}`}
                onClick={() => onSelect(row.id)}
              >
                <Paper variant={selected ? 'accent' : 'inset'} radius="lg" p={14}>
                  <Stack gap={4}>
                    <Text fw={600} lineClamp={2}>
                      {row.name}
                    </Text>
                    <Group gap={6} wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        {scenarioCount(row.count)}
                      </Text>
                      {result && (
                        <Text size="xs" c={result.colour}>
                          {result.label}
                        </Text>
                      )}
                    </Group>
                  </Stack>
                </Paper>
              </UnstyledButton>
            )
          })}
      </Stack>
    </ScrollArea>
  )
}
