import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ChannelsListPanel } from '../components/channel/ChannelsListPanel'
import { CardsPage } from '../components/ui/CardsPage'
import type { ChannelsBrowse } from '../hooks/useChannelsBrowse'

export type ChannelsPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
  browse?: ChannelsBrowse
}

export const ChannelsPage: React.FC<ChannelsPageProps> = ({
  emptyHero,
  browse,
}) => {
  const [search, setSearch] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.channels_title()}
            description={m.wires_channels_description()}
            docsHref="https://pikku.dev/docs/core-features/channels"
            search={{
              placeholder: m.channels_search_placeholder(),
              value: search,
              onChange: setSearch,
              width: 240,
            }}
          />
        }
        surface="cards"
      >
        <CardsPage>
          <ChannelsListPanel
            searchQuery={search}
            emptyHero={emptyHero}
            selectedName={browse?.selected}
          />
        </CardsPage>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
