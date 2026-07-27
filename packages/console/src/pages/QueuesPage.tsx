import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { QueuesListPanel } from '../components/queues/QueuesListPanel'
import { useQueueItems } from '../hooks/useQueueItems'

export const QueuesPage: React.FC = () => {
  const { items, loading } = useQueueItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={<ListPageHeader title={m.queues_title()} description={m.queues_description()} />}
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.queues_select_item()}
      >
        <QueuesListPanel />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
