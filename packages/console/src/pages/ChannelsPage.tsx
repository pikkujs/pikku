import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ChannelsTab } from '../components/tabs/ChannelsTab'

export type ChannelsPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
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
            docsHref="https://pikku.dev/docs/core-features/channels"
            search={{
              placeholder: m.channels_search_placeholder(),
              value: search,
              onChange: setSearch,
              width: 240,
            }}
          />
        }
        emptyPanelMessage={m.common_select_item()}
      >
        <ChannelsTab searchQuery={search} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
