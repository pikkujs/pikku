import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { McpListPanel } from '../components/mcp/McpListPanel'
import { useMcpItems } from '../hooks/useMcpItems'

export type McpPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const McpPage: React.FC<McpPageProps> = ({ emptyHero }) => {
  const { items, loading } = useMcpItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        flushBody
        header={
          <ListPageHeader
            title={m.mcp_title()}
            description={m.mcp_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.mcp_select_entry()}
      >
        <McpListPanel emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
