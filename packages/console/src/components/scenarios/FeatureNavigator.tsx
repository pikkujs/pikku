import React from 'react'
import { Box, Group, ScrollArea, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { SCENARIO_STATUS_COLOUR } from './ScenarioStatusMark'
import classes from './scenarios.module.css'
import type { FeatureDoc } from './scenario-doc-model'
import type { ScenarioFeatureTally, ScenarioRunLens } from './scenario-run-lens'

/** The rail's first row: the whole suite, which is where the screen opens. */
export const ALL_FEATURES = '__all__'

const SEGMENTS: (keyof ScenarioFeatureTally)[] = [
  'failed',
  'running',
  'passed',
  'waiting',
  'never',
]

const scenarioCount = (count: number) =>
  count === 1
    ? m.scenarios_scenario_count_one()
    : m.scenarios_scenario_count({ count })

/**
 * How a feature is doing, at rail width: one bar, one segment per outcome, in
 * the order that decides what the eye lands on — a single red scenario in a
 * feature of forty is the thing worth seeing from here.
 */
const ResultBar: React.FC<{ tally: ScenarioFeatureTally }> = ({ tally }) => {
  const total = SEGMENTS.reduce((sum, key) => sum + tally[key], 0)
  if (total === 0) return null
  return (
    <Group gap={2} wrap="nowrap" data-testid="feature-result-bar">
      {SEGMENTS.filter((key) => tally[key] > 0).map((key) => (
        <Box
          key={key}
          className={key === 'running' ? classes.statusPulse : undefined}
          style={{
            height: 3,
            borderRadius: 2,
            flexGrow: tally[key],
            background: SCENARIO_STATUS_COLOUR[key],
          }}
        />
      ))}
    </Group>
  )
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
    name: string
    count: number
    bar?: ScenarioFeatureTally
  }[] = [
    {
      id: ALL_FEATURES,
      name: m.scenarios_all_features(),
      count: features.reduce(
        (sum, feature) => sum + feature.scenarios.length,
        0
      ),
      bar: lens
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
      name: feature.name,
      count: feature.scenarios.length,
      bar: lens ? lens.tally(feature) : undefined,
    })),
  ]

  return (
    <ScrollArea style={{ height: '100%' }} data-testid="feature-navigator">
      <Stack gap={2} p="xs">
        {features.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            {m.scenarios_no_features()}
          </Text>
        )}
        {features.length > 0 &&
          rows.map((row) => {
            const selected = row.id === selectedId
            return (
              <Box
                key={row.id}
                data-testid={`feature-nav-${row.id}`}
                onClick={() => onSelect(row.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selected
                    ? 'var(--mantine-color-default-hover)'
                    : 'transparent',
                }}
              >
                <Text size="sm" fw={selected ? 600 : 500} lineClamp={1}>
                  {asI18n(row.name)}
                </Text>
                <Text size="xs" c="dimmed" ff="monospace">
                  {scenarioCount(row.count)}
                </Text>
                {row.bar && (
                  <Box pt={6}>
                    <ResultBar tally={row.bar} />
                  </Box>
                )}
              </Box>
            )
          })}
      </Stack>
    </ScrollArea>
  )
}
