import React, { Suspense, useState } from 'react'
import { Center, Loader, Group, SegmentedControl, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
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

const SEARCH_PLACEHOLDER: Record<string, string> = {
  http: 'Search routes...',
  channels: 'Search channels...',
  mcp: 'Search MCP tools, resources, prompts...',
  cli: 'Search commands...',
}

type ApisPageProps = {
  httpHero?: React.ReactNode
  channelsHero?: React.ReactNode
  mcpHero?: React.ReactNode
}

const ApisPageInner: React.FC<ApisPageProps> = ({ httpHero, channelsHero, mcpHero }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const tab = searchParams.get('tab') || 'http'

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    setSearchParams({ tab: value })
  }

  const renderTab = () => {
    switch (tab) {
      case 'channels':
        return <ChannelsTab searchQuery={searchQuery} emptyHero={channelsHero} />
      case 'mcp':
        return <McpTab searchQuery={searchQuery} emptyHero={mcpHero} />
      case 'cli':
        return <CliTab searchQuery={searchQuery} />
      default:
        return <HttpTab searchQuery={searchQuery} emptyHero={httpHero} />
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title="APIs"
            description="Browse HTTP routes, channels, MCP servers, and CLI surfaces"
            docsHref="https://pikku.dev/docs/wiring/http"
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

export const ApisPage: React.FC<ApisPageProps> = (props) => {
  return (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <ApisPageInner {...props} />
    </Suspense>
  )
}
