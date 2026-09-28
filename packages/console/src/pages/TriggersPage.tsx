import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TriggersListPanel } from '../components/triggers/TriggersListPanel'
import { useTriggerItems } from '../hooks/useTriggerItems'

export type TriggersPageProps = {
  /** Shown in place of the empty list — fabric hands each wire kind its own. */
  emptyHero?: React.ReactNode
}

export const TriggersPage: React.FC<TriggersPageProps> = ({ emptyHero }) => {
  const { items: pairs, loading } = useTriggerItems()
  const [searchQuery, setSearchQuery] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        surface="cards"
        header={
          <ListPageHeader
            title={m.triggers_title()}
            description={m.trigger_page_description()}
            docsHref="https://pikku.dev/docs/wiring/triggers"
            search={
              pairs.length > 0
                ? {
                    placeholder: m.triggers_search_placeholder(),
                    value: searchQuery,
                    onChange: setSearchQuery,
                    width: 240,
                  }
                : undefined
            }
          />
        }
        hidePanel={!loading && pairs.length === 0}
        emptyPanelMessage={m.triggers_select_item()}
      >
        <TriggersListPanel externalSearch={searchQuery} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
