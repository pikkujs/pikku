import React, { Suspense } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { TabbedSurface } from '../components/console/TabbedSurface'
import type { TabbedSurfaceTab } from '../components/console/TabbedSurface'
import { HttpTab } from '../components/tabs/HttpTab'
import { ChannelsTab } from '../components/tabs/ChannelsTab'
import { McpTab } from '../components/tabs/McpTab'
import { CliTab } from '../components/tabs/CliTab'
import { GatewaysTab } from '../components/tabs/GatewaysTab'
import { m, mKey } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type ApisPageProps = {
  httpHero?: React.ReactNode
  channelsHero?: React.ReactNode
  mcpHero?: React.ReactNode
  gatewaysHero?: React.ReactNode
}

export const ApisPage: React.FC<ApisPageProps> = ({
  httpHero,
  channelsHero,
  mcpHero,
  gatewaysHero,
}) => {
  useLocale()

  const tabs: TabbedSurfaceTab<I18nString>[] = [
    {
      value: 'http',
      label: m.apis_tab_http(),
      searchPlaceholder: mKey('apis.search.http'),
      render: (searchQuery) => (
        <HttpTab searchQuery={searchQuery} emptyHero={httpHero} />
      ),
    },
    {
      value: 'channels',
      label: m.apis_tab_channels(),
      searchPlaceholder: mKey('apis.search.channels'),
      render: (searchQuery) => (
        <ChannelsTab searchQuery={searchQuery} emptyHero={channelsHero} />
      ),
    },
    {
      value: 'mcp',
      label: m.apis_tab_mcp(),
      searchPlaceholder: mKey('apis.search.mcp'),
      render: (searchQuery) => (
        <McpTab searchQuery={searchQuery} emptyHero={mcpHero} />
      ),
    },
    {
      value: 'cli',
      label: m.apis_tab_cli(),
      searchPlaceholder: mKey('apis.search.cli'),
      render: (searchQuery) => <CliTab searchQuery={searchQuery} />,
    },
    {
      value: 'gateways',
      label: m.apis_tab_gateways(),
      searchPlaceholder: mKey('apis.search.gateways'),
      render: (searchQuery) => (
        <GatewaysTab searchQuery={searchQuery} emptyHero={gatewaysHero} />
      ),
    },
  ]

  return (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <TabbedSurface
        controls="shell"
        tabs={tabs}
        tabAriaLabel={m.apis_tab_aria()}
        title={m.apis_title()}
        description={m.apis_description()}
        docsHref="https://pikku.dev/docs/wiring/http"
        emptyPanelMessage={m.common_select_item()}
      />
    </Suspense>
  )
}
