import React from 'react'
import { Server } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PanelProvider } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { TabbedPageHeader } from '@/components/layout/TabbedPageHeader'
import { ServicesTab } from '@/components/tabs/ServicesTab'
import { MiddlewareTab } from '@/components/tabs/MiddlewareTab'
import { PermissionsTab } from '@/components/tabs/PermissionsTab'

const TABS = [
  { value: 'services', label: 'Services' },
  { value: 'middleware', label: 'Middleware' },
  { value: 'permissions', label: 'Permissions' },
]

export const RuntimePage: React.FunctionComponent = () => {
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
          <TabbedPageHeader
            icon={Server}
            category="Runtime"
            docsHref="https://pikku.dev/docs/core-features/services"
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
