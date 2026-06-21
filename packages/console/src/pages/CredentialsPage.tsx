import React, { useState } from 'react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CredentialsOverviewTab } from '../components/tabs/CredentialsOverviewTab'
import { CredentialUsersTab } from '../components/tabs/CredentialUsersTab'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type CredentialsTab = 'credentials' | 'users'

export const CredentialsPage: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
  useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const rawTab = searchParams.get('tab')
  const tab: CredentialsTab =
    rawTab === 'users' || rawTab === 'credentials' ? rawTab : 'credentials'

  const handleTabChange = (value: CredentialsTab) => {
    setSearchQuery('')
    setSearchParams({ tab: value })
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.credentials_title()}
            description={m.credentials_description()}
            docsHref="https://pikku.dev/docs/core-features/credentials"
            search={{
              placeholder: tab === 'users' ? m.credentials_search_users() : m.credentials_search_credentials(),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
            selection={{
              ariaLabel: m.credentials_tab_aria(),
              value: tab,
              onChange: handleTabChange,
              options: [
                { value: 'credentials', label: m.credentials_tab_global() },
                { value: 'users', label: m.credentials_tab_users() },
              ],
            }}
          />
        }
        emptyPanelMessage={m.credentials_select_user()}
        hidePanel={tab === 'credentials'}
      >
        {tab === 'users' ? (
          <CredentialUsersTab searchQuery={searchQuery} />
        ) : (
          <CredentialsOverviewTab searchQuery={searchQuery} emptyHero={emptyHero} />
        )}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
