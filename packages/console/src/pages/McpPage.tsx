import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { McpCards } from '../components/mcp/McpCards'
import { CardsPage } from '../components/ui/CardsPage'

export type McpPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const McpPage: React.FC<McpPageProps> = ({ emptyHero }) => {
  const [search, setSearch] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.mcp_title()}
            description={m.wires_mcp_description()}
            docsHref="https://pikku.dev/docs/wiring/mcp"
            search={{
              placeholder: m.mcp_search_placeholder(),
              value: search,
              onChange: setSearch,
              width: 240,
            }}
          />
        }
        hidePanel
        surface="cards"
      >
        <CardsPage>
          <McpCards searchQuery={search} emptyHero={emptyHero} />
        </CardsPage>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
