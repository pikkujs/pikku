import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Text,
  Button,
  Alert,
  Group,
  Avatar,
  Badge,
  Box,
} from '@pikku/mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { AlertTriangle, UserCog, ShieldCheck } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { UserRolesDrawer } from '../components/users/UserRolesDrawer'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { useAuth, type AuthUser } from '../context/AuthContext'

export const AdminUsersPage: React.FC = () => {
  useLocale()
  const { listUsers } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced] = useDebouncedValue(search, 250)
  const [rolesFor, setRolesFor] = useState<{
    id: string
    label: string
  } | null>(null)

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
      {usersQuery.error ? (
        <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
          <Text size="sm">{asI18n((usersQuery.error as Error).message)}</Text>
        </Alert>
      ) : (
        <TableListPage<AuthUser>
          icon={UserCog}
          title={m.users_title()}
          docsHref="https://www.better-auth.com/docs/plugins/admin"
          data={users}
          getKey={(u) => u.id}
          loading={usersQuery.isLoading}
          externalSearch={search}
          emptyTitle={m.users_empty()}
          columns={[
            {
              key: 'user',
              header: m.users_col_user(),
              render: (u) => (
                <Group gap="sm" wrap="nowrap">
                  <Avatar src={u.image ?? undefined} radius="xl" size="sm">
                    {(u.name ?? u.email).slice(0, 1).toUpperCase()}
                  </Avatar>
                  <Box style={{ minWidth: 0 }}>
                    {u.name && (
                      <Text size="sm" fw={500} truncate>
                        {asI18n(u.name)}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed" truncate>
                      {asI18n(u.email)}
                    </Text>
                  </Box>
                </Group>
              ),
            },
            {
              key: 'role',
              header: m.users_col_role(),
              render: (u) => (
                <Group gap={6}>
                  <Badge
                    size="sm"
                    variant="light"
                    color={u.role === 'admin' ? 'blue' : 'gray'}
                  >
                    {u.role === 'admin'
                      ? m.users_role_admin()
                      : m.users_role_user()}
                  </Badge>
                  {u.banned && (
                    <Badge size="sm" variant="light" color="red">
                      {m.users_banned()}
                    </Badge>
                  )}
                </Group>
              ),
            },
            {
              key: 'created',
              header: m.users_col_created(),
              render: (u) => (
                <Text size="sm" c="dimmed">
                  {u.createdAt
                    ? asI18n(new Date(u.createdAt).toLocaleDateString())
                    : asI18n('—')}
                </Text>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (u) => (
                <Group gap={6} justify="flex-end" wrap="nowrap">
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    leftSection={<ShieldCheck size={14} />}
                    onClick={() =>
                      setRolesFor({ id: u.id, label: u.email ?? u.id })
                    }
                  >
                    {m.users_roles_action()}
                  </Button>
                </Group>
              ),
            },
          ]}
        />
      )}
      <UserRolesDrawer
        opened={rolesFor !== null}
        onClose={() => setRolesFor(null)}
        userId={rolesFor?.id}
        userLabel={rolesFor?.label ?? ''}
      />
    </PageContainer>
  )
}
