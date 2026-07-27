import React from 'react'
import type { I18nString } from '@pikku/react'
import { TabbedSurface } from '../components/console/TabbedSurface'
import type { TabbedSurfaceTab } from '../components/console/TabbedSurface'
import { CredentialsOverviewTab } from '../components/tabs/CredentialsOverviewTab'
import { CredentialUsersTab } from '../components/tabs/CredentialUsersTab'
import { CredentialConnectionsTab } from '../components/tabs/CredentialConnectionsTab'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const CredentialsPage: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  useLocale()

  const tabs: TabbedSurfaceTab<I18nString>[] = [
    {
      value: 'credentials',
      label: m.credentials_tab_global(),
      searchPlaceholder: m.credentials_search_credentials(),
      hidePanel: true,
      render: (searchQuery) => (
        <CredentialsOverviewTab searchQuery={searchQuery} emptyHero={emptyHero} />
      ),
    },
    {
      value: 'connections',
      label: m.credentials_tab_connections(),
      searchPlaceholder: m.credentials_search_connections(),
      hidePanel: true,
      render: (searchQuery) => (
        <CredentialConnectionsTab
          searchQuery={searchQuery}
          emptyHero={emptyHero}
        />
      ),
    },
    {
      value: 'users',
      label: m.credentials_tab_users(),
      searchPlaceholder: m.credentials_search_users(),
      render: (searchQuery) => <CredentialUsersTab searchQuery={searchQuery} />,
    },
  ]

  return (
    <TabbedSurface
      controls="shell"
      tabs={tabs}
      tabAriaLabel={m.credentials_tab_aria()}
      title={m.credentials_title()}
      description={m.credentials_description()}
      docsHref="https://pikku.dev/docs/core-features/credentials"
      emptyPanelMessage={m.credentials_select_user()}
    />
  )
}
