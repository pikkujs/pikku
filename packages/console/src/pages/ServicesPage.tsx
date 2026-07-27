import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ServicesListPanel } from '../components/services/ServicesListPanel'

export const ServicesPage: React.FC = () => {
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={<ListPageHeader title={m.services_title()} description={m.services_description()} />}
        hidePanel
      >
        <ServicesListPanel />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
