import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { QueuesListPanel } from '../components/queues/QueuesListPanel'
import { useQueueItems } from '../hooks/useQueueItems'

export type QueuesPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const QueuesPage: React.FC<QueuesPageProps> = ({ emptyHero }) => {
  const { items, loading } = useQueueItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        flushBody
        header={
          <ListPageHeader
            title={m.queues_title()}
            description={m.queues_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.queues_select_item()}
      >
        <QueuesListPanel emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
