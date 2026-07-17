import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Text, Button, Center, Loader, Alert } from '@pikku/mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { AlertTriangle, UserCog } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { UsersTable } from '../components/users/UsersTable'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { useAuth } from '../context/AuthContext'
import { useImpersonation } from '../context/ImpersonationContext'

export const AdminUsersPage: React.FC = () => {
  useLocale()
  const { listUsers, user: currentUser } = useAuth()
  const { setTarget, target } = useImpersonation()
  const [search, setSearch] = useState('')
  const [debounced] = useDebouncedValue(search, 250)

  const usersQuery = useQuery({
    queryKey: ['admin-users', debounced],
    queryFn: () => listUsers(debounced || undefined),
  })

  const users = usersQuery.data ?? []

  return (
    <PageContainer
      header={
        <ListPageHeader
          title={m.users_title()}
          docsHref="https://www.better-auth.com/docs/plugins/admin"
          search={{
            placeholder: m.users_search_placeholder(),
            value: search,
            onChange: setSearch,
            width: 240,
          }}
        />
      }
    >
      {usersQuery.isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : usersQuery.error ? (
        <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
          <Text size="sm">{asI18n((usersQuery.error as Error).message)}</Text>
        </Alert>
      ) : users.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          {m.users_empty()}
        </Text>
      ) : (
        <UsersTable
          users={users}
          labels={{
            columnUser: m.users_col_user(),
            columnRole: m.users_col_role(),
            columnCreated: m.users_col_created(),
            roleAdmin: m.users_role_admin(),
            roleUser: m.users_role_user(),
            banned: m.users_banned(),
          }}
          renderActions={(u) => {
            if (u.id === currentUser?.id) return null
            const full = users.find((x) => x.id === u.id) ?? null
            return target?.id === u.id ? (
              <Button
                size="compact-sm"
                variant="light"
                color="yellow"
                leftSection={<UserCog size={14} />}
                onClick={() => setTarget(null)}
              >
                {m.impersonate_stop()}
              </Button>
            ) : (
              <Button
                size="compact-sm"
                variant="subtle"
                leftSection={<UserCog size={14} />}
                onClick={() => setTarget(full)}
              >
                {m.impersonate_button()}
              </Button>
            )
          }}
        />
      )}
    </PageContainer>
  )
}
