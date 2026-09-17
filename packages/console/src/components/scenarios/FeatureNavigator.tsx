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
 * How many scenarios a bar draws a cell each for.
 *
 * Past this the cells are thinner than the gaps between them at rail width and
 * the bar reads as a dotted line rather than a count, so a larger feature goes
 * back to one segment per outcome — the shape that still says something when
 * there is no room left to count.
 */
const COUNTABLE = 48

const Segment: React.FC<{
  status: keyof ScenarioFeatureTally
  grow: number
}> = ({ status, grow }) => (
  <Box
    className={status === 'running' ? classes.statusPulse : undefined}
    style={{
      height: 3,
      borderRadius: 2,
      flexGrow: grow,
      minWidth: 0,
      background: SCENARIO_STATUS_COLOUR[status],
    }}
  />
)

/**
 * How a feature is doing, at rail width: one cell per scenario, ordered by
 * outcome so what the eye lands on is a single red scenario in a feature of
 * forty. Cells rather than one block per outcome because a bar is also how many
 * — a feature of fifteen passing scenarios and a feature of two both fill their
 * width, and only the number of cells tells them apart.
 */
const ResultBar: React.FC<{ tally: ScenarioFeatureTally }> = ({ tally }) => {
  const total = SEGMENTS.reduce((sum, key) => sum + tally[key], 0)
  if (total === 0) return null
  const cells = SEGMENTS.flatMap((key) =>
    Array.from({ length: tally[key] }, () => key)
  )
  return (
    <Group gap={2} wrap="nowrap" data-testid="feature-result-bar">
      {total <= COUNTABLE
        ? cells.map((status, index) => (
            <Segment key={index} status={status} grow={1} />
          ))
        : SEGMENTS.filter((key) => tally[key] > 0).map((key) => (
            <Segment key={key} status={key} grow={tally[key]} />
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
