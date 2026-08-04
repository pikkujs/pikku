import React from 'react'
import { TabbedSurface } from '../components/console/TabbedSurface'
import type { TabbedSurfaceTab } from '../components/console/TabbedSurface'
import { ServicesTab } from '../components/tabs/ServicesTab'
import { MiddlewareTab } from '../components/tabs/MiddlewareTab'
import { PermissionsTab } from '../components/tabs/PermissionsTab'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const RuntimePage: React.FC = () => {
  useLocale()

  const tabs: TabbedSurfaceTab[] = [
    {
      value: 'services',
      label: 'Services',
      searchPlaceholder: m.runtime_search_services(),
      render: (searchQuery) => <ServicesTab searchQuery={searchQuery} />,
    },
    {
      value: 'middleware',
      label: 'Middleware',
      searchPlaceholder: m.runtime_search_middleware(),
      render: (searchQuery) => <MiddlewareTab searchQuery={searchQuery} />,
    },
    {
      value: 'permissions',
      label: 'Permissions',
      searchPlaceholder: m.runtime_search_permissions(),
      render: (searchQuery) => <PermissionsTab searchQuery={searchQuery} />,
    },
  ]

  return (
    <TabbedSurface
      tabs={tabs}
      title={m.runtime_title()}
      description={m.runtime_description()}
      emptyPanelMessage={m.common_select_item()}
    />
  )
}
