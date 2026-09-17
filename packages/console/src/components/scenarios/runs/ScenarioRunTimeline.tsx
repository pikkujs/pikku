import React from 'react'
import { Box, Group, Tooltip } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioResult } from '@pikku/core/scenario'
import { runDuration } from './scenario-run-format'

const SEGMENT_COLOUR = {
  passed: 'var(--mantine-color-green-6)',
  failed: 'var(--mantine-color-red-6)',
  skipped: 'var(--mantine-color-dimmed)',
}

type ScenarioRunTimelineProps = {
  results: ScenarioResult[]
  openName?: string
  onOpen: (name: string) => void
}

/**
 * The whole run as one bar, each scenario a segment sized by how long it took.
 * It answers where the time went and where the failures sit before any
 * scrolling happens, and doubles as the way into a scenario.
 */
export const ScenarioRunTimeline: React.FC<ScenarioRunTimelineProps> = ({
  results,
  openName,
  onOpen,
}) => {
  const total = results.reduce((sum, result) => sum + (result.durationMs ?? 0), 0)
  if (results.length === 0) return null

  return (
    <Group
      gap={2}
      wrap="nowrap"
      h={22}
      data-testid="scenario-run-timeline"
      aria-label={m.scenario_runs_timeline_label()}
    >
      {results.map((result) => {
        const colour =
          SEGMENT_COLOUR[result.status as keyof typeof SEGMENT_COLOUR] ??
          SEGMENT_COLOUR.skipped
        const open = result.name === openName
        return (
          <Tooltip
            key={result.name}
            label={asI18n(
              `${result.name} · ${runDuration(result.durationMs)}`
            )}
            withArrow
          >
            <Box
              component="button"
              type="button"
              onClick={() => onOpen(result.name)}
              aria-label={asI18n(result.name)}
              style={{
                flexGrow: total > 0 ? (result.durationMs ?? 0) / total : 1,
                flexBasis: 2,
                height: '100%',
                padding: 0,
                cursor: 'pointer',
                borderRadius: 2,
                border: 'none',
                outline: open
                  ? '2px solid var(--mantine-color-blue-5)'
                  : 'none',
                outlineOffset: 1,
                background: colour,
                opacity: open || !openName ? 1 : 0.55,
              }}
            />
          </Tooltip>
        )
      })}
    </Group>
  )
}
