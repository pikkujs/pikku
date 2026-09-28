import React, { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Group, Stack, Text } from '@pikku/mantine/core'
import { BotMessageSquare } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { toEnglishName } from '../../lib/strings'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { SummaryCard } from '../ui/SummaryCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevMono, DevTable } from '../ui/DevDetail'

const AGENTS_DOCS = 'https://pikku.dev/docs/wiring/agents'

interface AgentEntry {
  name: string
  displayName: string
  description?: string
  model?: string
  tools: number
  subAgents: number
  scored: boolean
}

export const AgentsWorkspace: React.FC<{
  onOpen: (name: string) => void
  headerRight?: ReactNode
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
}> = ({ onOpen, headerRight, emptyHero, metricSlot }) => {
  useLocale()
  const { meta, loading } = usePikkuMeta()
  const [searchQuery, setSearchQuery] = useState('')
  const query = searchQuery.trim().toLowerCase()

  const agents = useMemo(
    (): AgentEntry[] =>
      Object.entries((meta.agentsMeta ?? {}) as Record<string, any>)
        .map(([name, data]) => ({
          name,
          displayName: data.displayName || toEnglishName(name),
          description: data.summary ?? data.description,
          model: data.model,
          tools: (data.tools ?? []).length,
          subAgents: (data.agents ?? []).length,
          scored: (data.scorers ?? []).length > 0,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [meta.agentsMeta]
  )

  const header = (
    <ListPageHeader
      title={m.agents_title()}
      description={m.agents_page_description()}
      docsHref={AGENTS_DOCS}
      search={{
        placeholder: m.agents_search(),
        value: searchQuery,
        onChange: setSearchQuery,
        width: 240,
      }}
      view={headerRight}
    />
  )

  if (!loading && agents.length === 0) {
    return (
      <ResizablePanelLayout hidePanel header={header}>
        <EmptyStatePlaceholder
          icon={BotMessageSquare}
          hero={emptyHero}
          title={m.agents_empty_title()}
          description={m.agents_empty_description()}
          docsHref={AGENTS_DOCS}
        />
      </ResizablePanelLayout>
    )
  }

  const shown = query
    ? agents.filter((a) =>
        [a.name, a.displayName, a.description].some((v) =>
          v?.toLowerCase().includes(query)
        )
      )
    : agents
  const total = agents.length
  const actions = agents.reduce((sum, a) => sum + a.tools, 0)
  const handOff = agents.filter((a) => a.subAgents > 0).length
  const scored = agents.filter((a) => a.scored).length

  return (
    <ResizablePanelLayout hidePanel header={header} surface="cards">
      <CardsPage>
        {!loading && !query && (
          <SummaryCard
            testId="agents-summary"
            title={
              total === 1
                ? m.agents_hero_title_one()
                : m.agents_hero_title({ count: total })
            }
            blurb={m.agents_hero_body()}
            facts={[
              {
                label: m.agents_fact_assistants(),
                value: asI18n(String(total)),
              },
              {
                label: m.agents_fact_actions(),
                value: asI18n(String(actions)),
              },
              {
                label: m.agents_fact_handoff(),
                value: m.agents_fact_of({ done: handOff, total }),
              },
              {
                label: m.agents_fact_checked(),
                value: m.agents_fact_of({ done: scored, total }),
                tone: scored === 0 ? 'warn' : undefined,
              },
            ]}
          />
        )}
        <SectionCard
          testId="agents-list"
          title={m.agents_list_title()}
          subtitle={
            shown.length === 1
              ? m.agents_count_one()
              : m.agents_count({ count: shown.length })
          }
          blurb={m.agents_list_blurb()}
          footer={
            <ForDevelopers
              attached
              hint={m.agents_dev_hint()}
              testId="agents-developers"
            >
              <DevTable
                columns={[
                  m.agents_dev_col_assistant(),
                  m.agents_dev_col_code(),
                  m.agents_dev_col_model(),
                  m.agents_dev_col_tools(),
                  m.agents_dev_col_agents(),
                ]}
                rows={agents.map((agent) => ({
                  key: agent.name,
                  cells: [
                    <Text key="assistant" size="sm">
                      {asI18n(agent.displayName)}
                    </Text>,
                    <DevMono key="code" value={agent.name} copy />,
                    <DevMono key="model" value={agent.model ?? '—'} />,
                    <Text key="tools" size="sm">
                      {asI18n(String(agent.tools))}
                    </Text>,
                    <Text key="agents" size="sm">
                      {asI18n(agent.subAgents ? String(agent.subAgents) : '—')}
                    </Text>,
                  ],
                }))}
              />
            </ForDevelopers>
          }
        >
          <Stack gap="xs" mt="md">
            {shown.length === 0 ? (
              <Text size="sm" c="dimmed">
                {m.agents_no_matches({ query: searchQuery.trim() })}
              </Text>
            ) : (
              shown.map((agent) => (
                <CardRow
                  key={agent.name}
                  testId={`agent-${agent.name}`}
                  leading={
                    <StatusTile tone="info">
                      <BotMessageSquare size={18} />
                    </StatusTile>
                  }
                  title={asI18n(agent.displayName)}
                  meta={
                    <Stack gap={2}>
                      <Text size="sm" c="dimmed">
                        {agent.description
                          ? asI18n(agent.description)
                          : m.agents_no_description()}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {agent.tools === 0
                          ? m.agents_talk_only()
                          : agent.tools === 1
                            ? m.agents_can_do_one()
                            : m.agents_can_do({ count: agent.tools })}
                        {agent.subAgents > 0 ? asI18n(' · ') : null}
                        {agent.subAgents === 1
                          ? m.agents_hands_off_one()
                          : agent.subAgents > 1
                            ? m.agents_hands_off({ count: agent.subAgents })
                            : null}
                      </Text>
                    </Stack>
                  }
                  trailing={
                    <Group gap="md" wrap="nowrap">
                      {metricSlot?.(agent.name)}
                      <Button
                        size="xs"
                        variant="default"
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpen(agent.name)
                        }}
                      >
                        {m.agents_try()}
                      </Button>
                    </Group>
                  }
                  onClick={() => onOpen(agent.name)}
                />
              ))
            )}
          </Stack>
        </SectionCard>
      </CardsPage>
    </ResizablePanelLayout>
  )
}
