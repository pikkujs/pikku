import React from 'react'
import { Group, Stack, Text } from '@pikku/mantine/core'
import { Gauge } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'
import { useScorers } from '../hooks/useAgentRuns'

interface ScorerItem {
  name: string
  description: string
  lane: 'fast' | 'slow'
  sampleRate: number
  requiresReference: boolean
  agents: string[]
}

/**
 * What grades this project's agents, and how often.
 *
 * The sampling column carries the answer to the question the runs panel raises:
 * a run with no grades is usually a run that was never sampled, and the rate
 * lives here rather than being repeated on every ungraded run.
 */
export const ScorersPage: React.FC = () => {
  useLocale()
  const { data, isLoading } = useScorers()
  const scorers = (data as ScorerItem[] | undefined) ?? []

  const columns = [
    {
      key: 'name',
      header: 'SCORER',
      render: (item: ScorerItem) => (
        <Stack gap={2}>
          <Text fw={500}>{asI18n(item.name)}</Text>
          <Text size="xs" c="dimmed">
            {asI18n(item.description)}
          </Text>
        </Stack>
      ),
    },
    {
      key: 'lane',
      header: 'LANE',
      render: (item: ScorerItem) => (
        <PikkuBadge
          type="dynamic"
          badge="lane"
          value={
            item.lane === 'fast' ? m.scorers_lane_fast() : m.scorers_lane_slow()
          }
        />
      ),
    },
    {
      key: 'sampling',
      header: 'SAMPLING',
      align: 'right' as const,
      render: (item: ScorerItem) => (
        <Text
          size="sm"
          ff="monospace"
          c={item.requiresReference ? 'dimmed' : undefined}
        >
          {item.requiresReference
            ? m.scorers_reference_only()
            : item.sampleRate <= 0
              ? m.scorers_sample_never()
              : item.sampleRate >= 1
                ? m.scorers_sample_all()
                : m.scorers_sample_fraction({
                    percent: Math.round(item.sampleRate * 100),
                  })}
        </Text>
      ),
    },
    {
      key: 'agents',
      header: 'AGENTS',
      align: 'right' as const,
      render: (item: ScorerItem) =>
        item.agents.length === 0 ? (
          <Text size="sm" c="dimmed">
            {m.scorers_unused()}
          </Text>
        ) : (
          <Group gap={6} justify="flex-end">
            {item.agents.map((agent) => (
              <PikkuBadge
                key={agent}
                type="dynamic"
                badge="agent"
                value={agent}
              />
            ))}
          </Group>
        ),
    },
  ]

  return (
    <ConsoleSurface>
      <TableListPage
        title="Scorers"
        icon={Gauge}
        docsHref="https://pikku.dev/docs/wiring/agents"
        data={scorers}
        columns={columns}
        getKey={(item) => item.name}
        searchPlaceholder={m.scorers_search_placeholder()}
        searchFilter={(item, query) =>
          item.name.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
        }
        emptyTitle={m.scorers_empty_title()}
        emptyDescription={m.scorers_empty_description()}
        loading={isLoading}
      />
    </ConsoleSurface>
  )
}
