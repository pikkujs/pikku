import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { WebhooksCards } from '../components/webhooks/WebhooksCards'

export const WebhooksPage: React.FC = () => {
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={<ListPageHeader title={m.webhooks_title()} />}
        hidePanel
        surface="cards"
      >
        <CardsPage>
          <WebhooksCards />
        </CardsPage>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
