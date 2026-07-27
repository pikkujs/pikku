import { useState } from 'react'
import { Button } from '@pikku/mantine/core'
import { UserPlus } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { UsersDirectoryPanel } from '../components/users/UsersDirectoryPanel'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useAuth } from '../context/AuthContext'

export const AdminUsersPage: React.FC = () => {
  useLocale()
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  return (
    <PageContainer
      header={
        <ListPageHeader
          title={m.users_title()}
          docsHref="https://pikku.dev/docs/core-features/permission-guards"
          search={{
            placeholder: m.users_search_placeholder(),
            value: search,
            onChange: setSearch,
            width: 240,
          }}
          lead={
            can('admin:users:create') ? (
              <Button
                size="compact-sm"
                leftSection={<UserPlus size={14} />}
                onClick={() => setCreating(true)}
                data-testid="create-user"
              >
                {m.users_create_action()}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <UsersDirectoryPanel
        search={search}
        creating={creating}
        onCreatingChange={setCreating}
      />
    </PageContainer>
  )
}
