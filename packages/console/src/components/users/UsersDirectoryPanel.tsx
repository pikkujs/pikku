import React, { useState } from 'react'
import { Text, Button, Alert, Group, Avatar, Box } from '@pikku/mantine/core'
import { AlertTriangle, UserCog, ShieldCheck } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { TableListPage } from '../layout/TableListPage'
import { UserRolesDrawer } from './UserRolesDrawer'
import { UserStatusBadge } from './UserStatusBadge'
import { UserActionsMenu } from './UserActionsMenu'
import { UserActionDrawer } from './UserActionDrawer'
import { CreateUserDrawer } from './CreateUserDrawer'
import type { UserAction } from './user-actions'
import { useAdminUsers } from '../../hooks/useAdminUsers'
import type { AuthUser } from '../../context/AuthContext'

export interface UsersDirectoryPanelProps {
  /** Search term, already raw — the panel debounces before querying. */
  search?: string
  /** Opens the create-user drawer. The button that sets it lives with whoever
   * owns the header, because only they know if the viewer may create users. */
  creating?: boolean
  onCreatingChange?: (creating: boolean) => void
}

/**
 * The user directory table together with the drawers its rows open — roles,
 * ban/unban and the rest of the per-user actions, plus the create drawer.
 *
 * Fetches its own list through the ambient auth client, so a host can mount it
 * on its own and only has to supply a header if it wants search or create.
 */
export const UsersDirectoryPanel: React.FC<UsersDirectoryPanelProps> = ({
  search = '',
  creating = false,
  onCreatingChange,
}) => {
  useLocale()
  const { usersQuery, users, refetchUsers } = useAdminUsers(search)
  const [rolesFor, setRolesFor] = useState<{
    id: string
    label: string
  } | null>(null)
  const [actionFor, setActionFor] = useState<{
    action: UserAction
    user: AuthUser
  } | null>(null)

  return (
    <>
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
          getRowProps={(u) => ({
            'data-testid': 'user-row',
            'data-user-id': u.id,
          })}
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
      <CreateUserDrawer
        opened={creating}
        onClose={() => onCreatingChange?.(false)}
        onDone={refetchUsers}
      />
      <UserActionDrawer
        action={actionFor?.action ?? null}
        user={actionFor?.user ?? null}
        onClose={() => setActionFor(null)}
        onDone={refetchUsers}
      />
    </>
  )
}
