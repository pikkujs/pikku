import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { GatewaysTab } from '../components/tabs/GatewaysTab'

export type GatewaysPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const GatewaysPage: React.FC<GatewaysPageProps> = ({ emptyHero }) => {
  const [search, setSearch] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        flushBody
        header={
          <ListPageHeader
            title={m.gateways_title()}
            description={m.gateways_description()}
            docsHref="https://pikku.dev/docs/wiring/gateway"
            search={{
              placeholder: m.gateways_search_placeholder(),
              value: search,
              onChange: setSearch,
              width: 240,
            }}
          />
        }
        emptyPanelMessage={m.common_select_item()}
      >
        <GatewaysTab searchQuery={search} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
