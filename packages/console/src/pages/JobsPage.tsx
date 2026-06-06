import React from 'react'
import { Box, Stack, SegmentedControl } from '@mantine/core'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { SchedulersTab } from '../components/tabs/SchedulersTab'
import { QueuesTab } from '../components/tabs/QueuesTab'
import { TriggersTab } from '../components/tabs/TriggersTab'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'

const TABS = [
  { value: 'schedulers', label: 'Schedulers' },
  { value: 'queues', label: 'Queues' },
  { value: 'triggers', label: 'Triggers' },
]

export const JobsPage: React.FC = () => {
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
      <PageContainer
        fullWidth
        contentGap="md"
        style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
        header={
          <Stack gap="md">
            <ListPageHeader title="Async" description="Schedulers, queues, and triggers for this project" />
            <SegmentedControl size="xs" value={tab} onChange={handleTabChange} data={TABS} />
          </Stack>
        }
      >
        <Box style={{ flex: 1, minHeight: 0 }}>{renderTab()}</Box>
      </PageContainer>
    </PanelProvider>
  )
}
