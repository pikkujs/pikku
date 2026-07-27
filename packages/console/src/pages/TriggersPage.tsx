import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TriggersListPanel } from '../components/triggers/TriggersListPanel'
import { useTriggerItems } from '../hooks/useTriggerItems'

export const TriggersPage: React.FC = () => {
  const { items: pairs, loading } = useTriggerItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={<ListPageHeader title={m.triggers_title()} description={m.triggers_description()} />}
        hidePanel={!loading && pairs.length === 0}
        emptyPanelMessage={m.triggers_select_item()}
      >
        <TriggersListPanel />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
