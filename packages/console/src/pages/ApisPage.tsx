import React, { Suspense } from 'react'
import { Center, Loader } from '@mantine/core'
import { Globe } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { TabbedPageHeader } from '../components/layout/TabbedPageHeader'
import { HttpTab } from '../components/tabs/HttpTab'
import { ChannelsTab } from '../components/tabs/ChannelsTab'
import { McpTab } from '../components/tabs/McpTab'
import { CliTab } from '../components/tabs/CliTab'

const TABS = [
  { value: 'http', label: 'HTTP' },
  { value: 'channels', label: 'Channels' },
  { value: 'mcp', label: 'MCP' },
  { value: 'cli', label: 'CLI' },
]

const ApisPageInner: React.FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'http'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  const renderTab = () => {
    switch (tab) {
      case 'channels':
        return <ChannelsTab />
      case 'mcp':
        return <McpTab />
      case 'cli':
        return <CliTab />
      default:
        return <HttpTab />
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <TabbedPageHeader
            icon={Globe}
            category="APIs"
            docsHref="https://pikku.dev/docs/wiring/http"
            tabs={TABS}
            activeTab={tab}
            onTabChange={handleTabChange}
          />
        }
        showTabs={false}
        hidePanel
      >
        {renderTab()}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

export const ApisPage: React.FunctionComponent = () => {
  return (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <ApisPageInner />
    </Suspense>
  )
}
