import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { MiddlewareListPanel } from '../components/middleware/MiddlewareListPanel'
import { useMiddlewareItems } from '../hooks/useMiddlewareItems'

export const MiddlewarePage: React.FC = () => {
  const { items, loading } = useMiddlewareItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.middleware_title()}
            description={m.middleware_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.middleware_select_item()}
      >
        <MiddlewareListPanel />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
