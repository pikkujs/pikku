import React, { useState } from 'react'
import { Group, SegmentedControl, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SchedulersTab } from '../components/tabs/SchedulersTab'
import { QueuesTab } from '../components/tabs/QueuesTab'
import { TriggersTab } from '../components/tabs/TriggersTab'

const TABS = [
  { value: 'schedulers', label: 'Schedulers' },
  { value: 'queues', label: 'Queues' },
  { value: 'triggers', label: 'Triggers' },
]

const SEARCH_PLACEHOLDER: Record<string, string> = {
  schedulers: 'Search scheduled tasks...',
  queues: 'Search queue workers...',
  triggers: 'Search triggers...',
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
        return <TriggersTab searchQuery={searchQuery} emptyHero={triggersHero} />
      default:
        return <SchedulersTab searchQuery={searchQuery} emptyHero={schedulersHero} />
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title="Jobs"
            description="Scheduled tasks, queues, and triggers"
            docsHref="https://pikku.dev/docs/wiring/scheduled-tasks"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder={SEARCH_PLACEHOLDER[tab]}
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
        emptyPanelMessage="Select an item to view details"
      >
        {renderTab()}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
