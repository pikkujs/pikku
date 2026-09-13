import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ChannelsListPanel } from '../components/channel/ChannelsListPanel'

export type ChannelsPageProps = {
  emptyHero?: React.ReactNode
}

export const ChannelsPage: React.FC<ChannelsPageProps> = ({ emptyHero }) => {
  const [search, setSearch] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.channels_title()}
            description={m.channels_description()}
            search={{
              placeholder: m.channels_search_placeholder(),
              value: search,
              onChange: setSearch,
            }}
          />
        }
        hidePanel
      >
        <ChannelsListPanel searchQuery={search} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
