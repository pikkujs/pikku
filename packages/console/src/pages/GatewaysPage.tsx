import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { GatewaysWorkspace } from '../components/gateways/GatewaysWorkspace'
import { useGatewayItems } from '../hooks/useGatewayItems'

export type GatewaysPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const GatewaysPage: React.FC<GatewaysPageProps> = ({ emptyHero }) => {
  const [search, setSearch] = useState('')
  const { items, loading } = useGatewayItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        surface="cards"
        header={
          <ListPageHeader
            title={m.gateways_title()}
            description={m.gateway_page_description()}
            docsHref="https://pikku.dev/docs/wiring/gateway"
            search={{
              placeholder: m.gateways_search_placeholder(),
              value: search,
              onChange: setSearch,
              width: 240,
            }}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.gateways_select_item()}
      >
        <GatewaysWorkspace searchQuery={search} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
