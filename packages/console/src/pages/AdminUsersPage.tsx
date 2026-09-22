import { useState } from 'react'
import { Button } from '@pikku/mantine/core'
import { UserPlus } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { UsersDirectoryPanel } from '../components/users/UsersDirectoryPanel'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useUserAdmin } from '../context/UserAdminContext'

export const AdminUsersPage: React.FC = () => {
  useLocale()
  const { can } = useUserAdmin()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  return (
    <PageContainer
      data-testid="admin-users"
      noPadding
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
