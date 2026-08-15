import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { PermissionsListPanel } from '../components/permissions/PermissionsListPanel'
import { usePermissionItems } from '../hooks/usePermissionItems'

export const PermissionsPage: React.FC = () => {
  const { items, loading } = usePermissionItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.permissions_title()}
            description={m.permissions_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.permissions_select_item()}
      >
        <PermissionsListPanel />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
