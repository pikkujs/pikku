import React from 'react'
import { Users } from 'lucide-react'
import { useSearchParams } from '@/router'
import { TabbedPageHeader } from '@/components/layout/TabbedPageHeader'
import { CredentialsOverviewTab } from '@/components/tabs/CredentialsOverviewTab'
import { CredentialUsersTab } from '@/components/tabs/CredentialUsersTab'

const TABS = [
  { value: 'credentials', label: 'Credentials' },
  { value: 'users', label: 'Users' },
]

export const UsersPage: React.FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'credentials'

  return (
    <>
      <TabbedPageHeader
        icon={Users}
        category="Users"
        docsHref="https://pikku.dev/docs/core-features/credentials"
        tabs={TABS}
        activeTab={tab}
        onTabChange={(value) => setSearchParams({ tab: value })}
      />
      {tab === 'users' ? <CredentialUsersTab /> : <CredentialsOverviewTab />}
    </>
  )
}
