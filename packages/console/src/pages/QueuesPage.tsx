import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { QueuesWorkspace } from '../components/queues/QueuesWorkspace'
import { useQueueItems } from '../hooks/useQueueItems'

export type QueuesPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const QueuesPage: React.FC<QueuesPageProps> = ({ emptyHero }) => {
  const { items, loading } = useQueueItems()
  const [searchQuery, setSearchQuery] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        surface="cards"
        header={
          <ListPageHeader
            title={m.queues_title()}
            description={m.queue_page_description()}
            docsHref="https://pikku.dev/docs/wiring/queue"
            search={{
              placeholder: m.queue_page_search(),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.queues_select_item()}
      >
        <QueuesWorkspace searchQuery={searchQuery} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
