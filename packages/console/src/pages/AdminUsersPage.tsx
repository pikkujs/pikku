import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Text, Button, Alert, Group, Avatar, Box } from '@pikku/mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { AlertTriangle, UserCog, ShieldCheck } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { UserRolesDrawer } from '../components/users/UserRolesDrawer'
import { UserStatusBadge } from '../components/users/UserStatusBadge'
import { UserActionsMenu } from '../components/users/UserActionsMenu'
import { UserActionModal } from '../components/users/UserActionModal'
import type { UserAction } from '../components/users/user-actions'
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
  const [actionFor, setActionFor] = useState<{
    action: UserAction
    user: AuthUser
  } | null>(null)

  const usersQuery = useQuery({
    queryKey: ['admin-users', debounced],
    queryFn: () => listUsers(debounced || undefined),
  })

  const users = usersQuery.data ?? []
  // Ban state and session count both live on the row, so any action that
  // changes them has to bring the list back rather than patch it locally.
  const refetchUsers = () => {
    void usersQuery.refetch()
  }

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
          docsHref="https://pikku.dev/docs/core-features/permission-guards"
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
            // Only shown where the host wires `admin()`; without it the server
            // reports no ban state and an always-empty column is just noise.
            ...(users.some((u) => u.banned !== undefined)
              ? [
                  {
                    key: 'status',
                    header: m.users_col_status(),
                    render: (u: AuthUser) => <UserStatusBadge user={u} />,
                  },
                ]
              : []),
            {
              key: 'created',
              header: m.users_col_created(),
              render: (u) => (
                <Text size="sm" c="dimmed">
                  {u.createdAt
                    ? asI18n(new Date(u.createdAt).toLocaleDateString())
                    : m.users_empty_created()}
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
                  <UserActionsMenu
                    user={u}
                    onAction={(action) => setActionFor({ action, user: u })}
                    onUnbanned={refetchUsers}
                  />
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
      <UserActionModal
        action={actionFor?.action ?? null}
        user={actionFor?.user ?? null}
        onClose={() => setActionFor(null)}
        onDone={refetchUsers}
      />
    </PageContainer>
  )
}
