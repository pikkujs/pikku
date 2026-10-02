import React, { useState } from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { ClipboardCheck } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { SummaryCard } from '../components/ui/SummaryCard'
import { CardRow } from '../components/ui/CardRow'
import { StatusBadge } from '../components/ui/StatusBadge'
import { StatusTile } from '../components/ui/StatusTile'
import { ForDevelopers } from '../components/ui/ForDevelopers'
import { DevMono, DevTable } from '../components/ui/DevDetail'
import { useScorers } from '../hooks/useAgentRuns'
import { toEnglishName } from '../lib/strings'

const SCORERS_DOCS = 'https://pikku.dev/docs/wiring/agents'

interface ScorerItem {
  name: string
  description: string
  lane: 'fast' | 'slow'
  sampleRate: number
  requiresReference: boolean
  agents: string[]
}

const checkName = (name: string) => {
  const english = toEnglishName(name)
  return english.charAt(0) + english.slice(1).toLowerCase()
}

const isLive = (item: ScorerItem) =>
  !item.requiresReference && item.sampleRate > 0

const sampling = (item: ScorerItem) => {
  if (item.requiresReference) return m.scorers_tests_only()
  if (item.sampleRate <= 0) return m.scorers_not_live()
  if (item.sampleRate >= 1) return m.scorers_every_answer()
  const every = 1 / item.sampleRate
  return Number.isInteger(every)
    ? m.scorers_one_in({ count: every })
    : m.scorers_percent({ percent: Math.round(item.sampleRate * 100) })
}

export const ScorersPage: React.FC = () => {
  useLocale()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useScorers()
  const scorers = (data as ScorerItem[] | undefined) ?? []
  const query = search.trim().toLowerCase()

  const header = (
    <ListPageHeader
      title={m.scorers_title()}
      description={m.scorers_page_description()}
      docsHref={SCORERS_DOCS}
      search={{
        placeholder: m.scorers_search(),
        value: search,
        onChange: setSearch,
        width: 240,
      }}
    />
  )

  if (!isLoading && scorers.length === 0) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout hidePanel header={header}>
          <EmptyStatePlaceholder
            icon={ClipboardCheck}
            title={m.scorers_empty_title()}
            description={m.scorers_empty_description()}
            docsHref={SCORERS_DOCS}
          />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  const total = scorers.length
  const attached = scorers.filter((s) => s.agents.length > 0).length
  const live = scorers.filter(isLive).length
  const idle = attached === 0
  const shown = query
    ? scorers.filter((s) =>
        [s.name, checkName(s.name), s.description].some((v) =>
          v?.toLowerCase().includes(query)
        )
      )
    : scorers

  return (
    <ConsoleSurface>
      <ResizablePanelLayout hidePanel header={header} surface="cards">
        <CardsPage>
          {!isLoading && !query && (
            <SummaryCard
              testId="scorers-summary"
              eyebrow={
                idle ? (
                  <StatusBadge tone="warn">
                    {m.scorers_hero_badge()}
                  </StatusBadge>
                ) : undefined
              }
              title={
                idle
                  ? m.scorers_hero_idle_title()
                  : attached === 1
                    ? m.scorers_hero_title_one()
                    : m.scorers_hero_title({ count: attached })
              }
              blurb={
                !idle
                  ? m.scorers_hero_body()
                  : total === 1
                    ? m.scorers_hero_body_idle_one()
                    : m.scorers_hero_body_idle({ count: total })
              }
              facts={[
                {
                  label: m.scorers_fact_checks(),
                  value: asI18n(String(total)),
                },
                {
                  label: m.scorers_fact_attached(),
                  value: m.scorers_fact_of({ done: attached, total }),
                  tone: idle ? 'warn' : undefined,
                },
                {
                  label: m.scorers_fact_live(),
                  value: m.scorers_fact_of({ done: live, total }),
                },
              ]}
            />
          )}
          <SectionCard
            testId="scorers-list"
            title={m.scorers_list_title()}
            subtitle={
              shown.length === 1
                ? m.scorers_count_one()
                : m.scorers_count({ count: shown.length })
            }
            blurb={m.scorers_list_blurb()}
            footer={
              <ForDevelopers
                attached
                hint={m.scorers_dev_hint()}
                testId="scorers-developers"
              >
                <DevTable
                  columns={[
                    m.scorers_dev_col_check(),
                    m.scorers_dev_col_code(),
                    m.scorers_column_lane(),
                    m.scorers_column_sampling(),
                    m.scorers_column_agents(),
                  ]}
                  rows={scorers.map((item) => ({
                    key: item.name,
                    cells: [
                      <Text key="check" size="sm">
                        {asI18n(checkName(item.name))}
                      </Text>,
                      <DevMono key="code" value={item.name} copy />,
                      <DevMono key="lane" value={item.lane} />,
                      <DevMono
                        key="sampling"
                        value={
                          item.requiresReference
                            ? 'reference'
                            : String(item.sampleRate)
                        }
                      />,
                      <DevMono
                        key="agents"
                        value={item.agents.join(', ') || '—'}
                      />,
                    ],
                  }))}
                />
              </ForDevelopers>
            }
          >
            <Stack gap="xs" mt="md">
              {shown.length === 0 && query ? (
                <Text size="sm" c="dimmed">
                  {m.scorers_no_matches({ query: search.trim() })}
                </Text>
              ) : (
                shown.map((item) => {
                  const unattached = item.agents.length === 0
                  const off = !isLive(item)
                  return (
                    <CardRow
                      key={item.name}
                      testId={`scorer-${item.name}`}
                      leading={
                        <StatusTile
                          tone={off ? 'neutral' : unattached ? 'warn' : 'good'}
                        >
                          <ClipboardCheck size={18} />
                        </StatusTile>
                      }
                      title={asI18n(checkName(item.name))}
                      badges={
                        off ? (
                          <StatusBadge tone="neutral" size="sm">
                            {m.scorers_badge_off()}
                          </StatusBadge>
                        ) : unattached ? (
                          <StatusBadge tone="warn" size="sm">
                            {m.scorers_badge_unattached()}
                          </StatusBadge>
                        ) : undefined
                      }
                      meta={
                        <Stack gap={2}>
                          <Text size="sm" c="dimmed">
                            {item.description
                              ? asI18n(item.description)
                              : m.scorers_no_description()}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {item.lane === 'fast'
                              ? m.scorers_quick()
                              : m.scorers_thorough()}
                            {asI18n(' · ')}
                            {sampling(item)}
                          </Text>
                        </Stack>
                      }
                    />
                  )
                })
              )}
            </Stack>
          </SectionCard>
        </CardsPage>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
