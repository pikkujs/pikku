import React from 'react'
import { Box, SegmentedControl } from '@mantine/core'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { CredentialsOverviewTab } from '../components/tabs/CredentialsOverviewTab'
import { CredentialUsersTab } from '../components/tabs/CredentialUsersTab'

const TABS = [
  { value: 'credentials', label: 'Global' },
  { value: 'users', label: 'Users' },
]

export const UsersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'credentials'

  const tabHeader = (
    <Box px="sm" py="xs">
      <SegmentedControl
        size="sm"
        value={tab}
        onChange={(value) => setSearchParams({ tab: value })}
        data={TABS}
      />
    </Box>
  )

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={tabHeader}
        emptyPanelMessage="Select a user to view their credentials"
        hidePanel={tab === 'credentials'}
      >
        {tab === 'users' ? <CredentialUsersTab /> : <CredentialsOverviewTab />}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
