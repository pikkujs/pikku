import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { HttpListPanel } from '../components/http/HttpListPanel'
import { useHttpItems } from '../hooks/useHttpItems'

export const HttpPage: React.FC = () => {
  const { items: routes, loading } = useHttpItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.http_title()}
            description={m.http_description()}
          />
        }
        hidePanel={!loading && routes.length === 0}
        emptyPanelMessage={m.http_select_route()}
      >
        <HttpListPanel />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
