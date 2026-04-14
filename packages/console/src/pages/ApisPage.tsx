import React, { Suspense } from 'react'
import { Center, Loader, Box } from '@mantine/core'
import { Globe } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { TabbedPageHeader } from '../components/layout/TabbedPageHeader'
import { HttpTab } from '../components/tabs/HttpTab'
import { ChannelsTab } from '../components/tabs/ChannelsTab'
import { McpTab } from '../components/tabs/McpTab'
import { CliTab } from '../components/tabs/CliTab'
import styles from '../components/ui/console.module.css'

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
      <Box className={styles.flexColumn} style={{ height: '100vh' }}>
        <TabbedPageHeader
          icon={Globe}
          category="APIs"
          docsHref="https://pikku.dev/docs/wiring/http"
          tabs={TABS}
          activeTab={tab}
          onTabChange={handleTabChange}
        />
        <Box className={styles.flexGrow} style={{ minHeight: 0 }}>
          {renderTab()}
        </Box>
      </Box>
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
