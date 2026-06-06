import React from 'react'
import { useSearchParams } from '../router'
import { Stack, SegmentedControl } from '@mantine/core'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ServicesTab } from '../components/tabs/ServicesTab'
import { MiddlewareTab } from '../components/tabs/MiddlewareTab'
import { PermissionsTab } from '../components/tabs/PermissionsTab'

const TABS = [
  { value: 'services', label: 'Services' },
  { value: 'middleware', label: 'Middleware' },
  { value: 'permissions', label: 'Permissions' },
]

export const RuntimePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'services'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  const renderTab = () => {
    switch (tab) {
      case 'middleware':
        return <MiddlewareTab />
      case 'permissions':
        return <PermissionsTab />
      default:
        return <ServicesTab />
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <Stack gap="md">
            <ListPageHeader title="Runtime" description="Services, middleware, and permission guards" />
            <SegmentedControl size="xs" value={tab} onChange={handleTabChange} data={TABS} />
          </Stack>
        }
        showTabs={false}
        emptyPanelMessage="Select an item to view its details"
      >
        {renderTab()}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
