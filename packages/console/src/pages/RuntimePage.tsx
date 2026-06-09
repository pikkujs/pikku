import React, { useState } from 'react'
import { Group, SegmentedControl, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { useSearchParams } from '../router'
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

const SEARCH_PLACEHOLDER: Record<string, string> = {
  services: 'Search services...',
  middleware: 'Search middleware...',
  permissions: 'Search permissions...',
}

export const RuntimePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const tab = searchParams.get('tab') || 'services'

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    setSearchParams({ tab: value })
  }

  const renderTab = () => {
    switch (tab) {
      case 'middleware':
        return <MiddlewareTab searchQuery={searchQuery} />
      case 'permissions':
        return <PermissionsTab searchQuery={searchQuery} />
      default:
        return <ServicesTab searchQuery={searchQuery} />
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title="Runtime"
            description="Services, middleware, and permission guards"
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
        emptyPanelMessage="Select an item to view its details"
      >
        {renderTab()}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
