import React from 'react'
import { Clock } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { TabbedPageHeader } from '../components/layout/TabbedPageHeader'
import { SchedulersTab } from '../components/tabs/SchedulersTab'
import { QueuesTab } from '../components/tabs/QueuesTab'
import { TriggersTab } from '../components/tabs/TriggersTab'

const TABS = [
  { value: 'schedulers', label: 'Schedulers' },
  { value: 'queues', label: 'Queues' },
  { value: 'triggers', label: 'Triggers' },
]

export const JobsPage: React.FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'schedulers'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  const renderTab = () => {
    switch (tab) {
      case 'queues':
        return <QueuesTab />
      case 'triggers':
        return <TriggersTab />
      default:
        return <SchedulersTab />
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <TabbedPageHeader
            icon={Clock}
            category="Jobs"
            docsHref="https://pikku.dev/docs/wiring/scheduled-tasks"
            tabs={TABS}
            activeTab={tab}
            onTabChange={handleTabChange}
          />
        }
        showTabs={false}
        emptyPanelMessage="Select an item to view its details"
      >
        {renderTab()}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
