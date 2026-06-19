import React, { useState } from 'react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CredentialsOverviewTab } from '../components/tabs/CredentialsOverviewTab'
import { CredentialUsersTab } from '../components/tabs/CredentialUsersTab'
import { useI18n } from '@pikku/react/i18n'

type CredentialsTab = 'credentials' | 'users'

export const CredentialsPage: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const tab = (searchParams.get('tab') || 'credentials') as CredentialsTab

  const handleTabChange = (value: CredentialsTab) => {
    setSearchQuery('')
    setSearchParams({ tab: value })
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={t('credentials.title')}
            description={t('credentials.description')}
            docsHref="https://pikku.dev/docs/core-features/credentials"
            search={{
              placeholder: tab === 'users' ? t('credentials.search_users') : t('credentials.search_credentials'),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
            selection={{
              ariaLabel: t('credentials.tab_aria'),
              value: tab,
              onChange: handleTabChange,
              options: [
                { value: 'credentials', label: t('credentials.tab_global') },
                { value: 'users', label: t('credentials.tab_users') },
              ],
            }}
          />
        }
        emptyPanelMessage={t('credentials.select_user')}
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
