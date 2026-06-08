import React, { useState } from 'react'
import { Group, SegmentedControl, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CredentialsOverviewTab } from '../components/tabs/CredentialsOverviewTab'
import { CredentialUsersTab } from '../components/tabs/CredentialUsersTab'

const TABS = [
  { value: 'credentials', label: 'Global' },
  { value: 'users', label: 'Users' },
]

export const UsersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const tab = searchParams.get('tab') || 'credentials'

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    setSearchParams({ tab: value })
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title="Credentials"
            description="OAuth2 and API key credentials"
            docsHref="https://pikku.dev/docs/core-features/credentials"
            filters={
              <Group gap="sm" wrap="nowrap">
                {tab === 'users' && (
                  <TextInput
                    placeholder="Search users..."
                    leftSection={<Search size={14} />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="xs"
                    style={{ width: 240 }}
                  />
                )}
                <SegmentedControl
                  size="xs"
                  value={tab}
                  onChange={handleTabChange}
                  data={TABS}
                />
              </Group>
            }
          />
        }
        emptyPanelMessage="Select a user to view their credentials"
        hidePanel={tab === 'credentials'}
      >
        {tab === 'users' ? (
          <CredentialUsersTab searchQuery={searchQuery} />
        ) : (
          <CredentialsOverviewTab />
        )}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
