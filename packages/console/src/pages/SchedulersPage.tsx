import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SchedulesWorkspace } from '../components/schedulers/SchedulesWorkspace'
import { useSchedulerItems } from '../hooks/useSchedulerItems'

export type SchedulersPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const SchedulersPage: React.FC<SchedulersPageProps> = ({
  emptyHero,
}) => {
  const { items, loading } = useSchedulerItems()
  const [searchQuery, setSearchQuery] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        surface="cards"
        header={
          <ListPageHeader
            title={m.schedulers_title()}
            description={m.scheduler_page_description()}
            docsHref="https://pikku.dev/docs/wiring/scheduled-tasks"
            search={{
              placeholder: m.schedulers_search_placeholder(),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.schedulers_select_item()}
      >
        <SchedulesWorkspace searchQuery={searchQuery} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
