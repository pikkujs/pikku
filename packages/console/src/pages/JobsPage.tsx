import React, { useState } from 'react'
import { Group, SegmentedControl, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SchedulersTab } from '../components/tabs/SchedulersTab'
import { QueuesTab } from '../components/tabs/QueuesTab'
import { TriggersTab } from '../components/tabs/TriggersTab'
import { m, mKey } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const TABS = [
  { value: 'schedulers', label: 'Schedulers' },
  { value: 'queues', label: 'Queues' },
  { value: 'triggers', label: 'Triggers' },
]

const SEARCH_PLACEHOLDER_KEY: Record<string, string> = {
  schedulers: 'jobs.search.schedulers',
  queues: 'jobs.search.queues',
  triggers: 'jobs.search.triggers',
}

interface JobsPageProps {
  queuesHero?: React.ReactNode
  triggersHero?: React.ReactNode
  schedulersHero?: React.ReactNode
}

export const JobsPage: React.FC<JobsPageProps> = ({
  queuesHero,
  triggersHero,
  schedulersHero,
}) => {
  useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const tab = searchParams.get('tab') || 'schedulers'

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    setSearchParams({ tab: value })
  }

  const renderTab = () => {
    switch (tab) {
      case 'queues':
        return <QueuesTab searchQuery={searchQuery} emptyHero={queuesHero} />
      case 'triggers':
        return (
          <TriggersTab searchQuery={searchQuery} emptyHero={triggersHero} />
        )
      default:
        return (
          <SchedulersTab searchQuery={searchQuery} emptyHero={schedulersHero} />
        )
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.jobs_title()}
            description={m.jobs_description()}
            docsHref="https://pikku.dev/docs/wiring/scheduled-tasks"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder={mKey(SEARCH_PLACEHOLDER_KEY[tab])}
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
                <SegmentedControl
                  size="xs"
                  value={tab}
                  onChange={handleTabChange}
                  data={TABS}
                />
              </Group>
            }
          />
        }
        emptyPanelMessage={m.common_select_item()}
      >
        {renderTab()}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
