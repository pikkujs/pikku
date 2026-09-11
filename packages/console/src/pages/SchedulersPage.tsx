import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SchedulersListPanel } from '../components/schedulers/SchedulersListPanel'
import { useSchedulerItems } from '../hooks/useSchedulerItems'

export type SchedulersPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const SchedulersPage: React.FC<SchedulersPageProps> = ({
  emptyHero,
}) => {
  const { items, loading } = useSchedulerItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        flushBody
        header={
          <ListPageHeader
            title={m.schedulers_title()}
            description={m.schedulers_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.schedulers_select_item()}
      >
        <SchedulersListPanel emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
