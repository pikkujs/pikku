import React, { useState } from 'react'
import { Group, SegmentedControl, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ServicesTab } from '../components/tabs/ServicesTab'
import { MiddlewareTab } from '../components/tabs/MiddlewareTab'
import { PermissionsTab } from '../components/tabs/PermissionsTab'
import { m, mKey } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const TABS = [
  { value: 'services', label: 'Services' },
  { value: 'middleware', label: 'Middleware' },
  { value: 'permissions', label: 'Permissions' },
]

const SEARCH_PLACEHOLDER_KEY: Record<string, string> = {
  services: 'runtime.search.services',
  middleware: 'runtime.search.middleware',
  permissions: 'runtime.search.permissions',
}

export const RuntimePage: React.FC = () => {
  useLocale()
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
            title={m.runtime_title()}
            description={m.runtime_description()}
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
