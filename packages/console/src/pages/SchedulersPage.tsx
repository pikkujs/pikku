import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SchedulersListPanel } from '../components/schedulers/SchedulersListPanel'
import { useSchedulerItems } from '../hooks/useSchedulerItems'

export const SchedulersPage: React.FC = () => {
  const { items, loading } = useSchedulerItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.schedulers_title()}
            description={m.schedulers_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.schedulers_select_item()}
      >
        <SchedulersListPanel />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
