import React from 'react'
import { Users } from 'lucide-react'
import { useSearchParams } from '@/router'
import { PanelProvider } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { TabbedPageHeader } from '@/components/layout/TabbedPageHeader'
import { CredentialsOverviewTab } from '@/components/tabs/CredentialsOverviewTab'
import { CredentialUsersTab } from '@/components/tabs/CredentialUsersTab'

const TABS = [
  { value: 'credentials', label: 'Global' },
  { value: 'users', label: 'Users' },
]

export const UsersPage: React.FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'credentials'

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <TabbedPageHeader
            icon={Users}
            category="Credentials"
            docsHref="https://pikku.dev/docs/core-features/credentials"
            tabs={TABS}
            activeTab={tab}
            onTabChange={(value) => setSearchParams({ tab: value })}
          />
        }
        emptyPanelMessage="Select a user to view their credentials"
        hidePanel={tab === 'credentials'}
      >
        {tab === 'users' ? <CredentialUsersTab /> : <CredentialsOverviewTab />}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
