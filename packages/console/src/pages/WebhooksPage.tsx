import React from 'react'
import { asI18n } from '@pikku/react'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { WebhooksListPanel } from '../components/webhooks/WebhooksListPanel'

export const WebhooksPage: React.FC = () => {
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={asI18n('Webhooks')}
            description={asI18n(
              'Outgoing webhook deliveries and their attempt history'
            )}
          />
        }
        hidePanel
      >
        <WebhooksListPanel />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
