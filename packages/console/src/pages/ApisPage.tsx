import React, { Suspense, useState } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { HttpTab } from '../components/tabs/HttpTab'
import { ChannelsTab } from '../components/tabs/ChannelsTab'
import { McpTab } from '../components/tabs/McpTab'
import { CliTab } from '../components/tabs/CliTab'
import { m, mKey } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type ApisTab = 'http' | 'channels' | 'mcp' | 'cli'

const SEARCH_PLACEHOLDER_KEY: Record<ApisTab, string> = {
  http: 'apis.search.http',
  channels: 'apis.search.channels',
  mcp: 'apis.search.mcp',
  cli: 'apis.search.cli',
}

type ApisPageProps = {
  httpHero?: React.ReactNode
  channelsHero?: React.ReactNode
  mcpHero?: React.ReactNode
}

const ApisPageInner: React.FC<ApisPageProps> = ({ httpHero, channelsHero, mcpHero }) => {
  useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const rawTab = searchParams.get('tab')
  const tab: ApisTab =
    rawTab === 'http' ||
    rawTab === 'channels' ||
    rawTab === 'mcp' ||
    rawTab === 'cli'
      ? rawTab
      : 'http'

  const handleTabChange = (value: ApisTab) => {
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
            title={m.apis_title()}
            description={m.apis_description()}
            docsHref="https://pikku.dev/docs/wiring/http"
            search={{
              placeholder: mKey(SEARCH_PLACEHOLDER_KEY[tab]),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
            selection={{
              ariaLabel: m.apis_tab_aria(),
              value: tab,
              onChange: handleTabChange,
              options: [
                { value: 'http', label: m.apis_tab_http() },
                { value: 'channels', label: m.apis_tab_channels() },
                { value: 'mcp', label: m.apis_tab_mcp() },
                { value: 'cli', label: m.apis_tab_cli() },
              ],
            }}
          />
        }
        emptyPanelMessage={m.common_select_item()}
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
