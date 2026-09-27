import React, { useState } from 'react'
import { Avatar, Loader, Stack, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { UserRolesPanel } from './UserRolesPanel'
import { UserStatusBadge } from './UserStatusBadge'
import { UserActionsMenu } from './UserActionsMenu'
import { UserActionPanel } from './UserActionPanel'
import { CreateUserPanel } from './CreateUserPanel'
import type { UserAction } from './user-actions'
import { describeUsersError, useAdminUsers } from '../../hooks/useAdminUsers'
import type { AuthUser } from '../../context/AuthContext'

export interface UsersDirectoryPanelProps {
  /** Search term, already raw — the panel debounces before querying. */
  search?: string
  /** Opens the create-user panel. The button that sets it is passed in as
   * `action`, because only the host knows if the viewer may create users. */
  creating?: boolean
  onCreatingChange?: (creating: boolean) => void
  action?: React.ReactNode
}

/**
 * The people signed up to the app, as one card of rows, together with the
 * panels a row opens — clicking a row opens that user's roles and scopes, and
 * its menu opens ban/unban and the rest of the per-user actions.
 */
export const UsersDirectoryPanel: React.FC<UsersDirectoryPanelProps> = ({
  search = '',
  creating = false,
  onCreatingChange,
  action,
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

  const empty = !usersQuery.isLoading && users.length === 0

  return (
    <>
      <SectionCard
        title={m.users_people_title()}
        subtitle={users.length ? asI18n(String(users.length)) : undefined}
        blurb={
          empty && !search ? m.users_none_blurb() : m.users_people_blurb()
        }
        right={action}
        testId="users-directory"
      >
        {usersQuery.error ? (
          <Text size="sm" c="red" mt="md">
            {asI18n(describeUsersError(usersQuery.error))}
          </Text>
        ) : usersQuery.isLoading ? (
          <Loader size="sm" mt="md" />
        ) : empty ? (
          search ? (
            <Text size="sm" c="dimmed" mt="md">
              {m.users_empty()}
            </Text>
          ) : null
        ) : (
          <Stack gap={8} mt="md">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onOpen={() =>
                  setRolesFor({ id: u.id, label: u.email ?? u.id })
                }
                onAction={(next) => setActionFor({ action: next, user: u })}
                onUnbanned={refetchUsers}
              />
            ))}
          </Stack>
        )}
      </SectionCard>
      <UserRolesPanel
        opened={rolesFor !== null}
        onClose={() => setRolesFor(null)}
        userId={rolesFor?.id}
        userLabel={rolesFor?.label ?? ''}
      />
      <CreateUserPanel
        opened={creating}
        onClose={() => onCreatingChange?.(false)}
        onDone={refetchUsers}
      />
      <UserActionPanel
        action={actionFor?.action ?? null}
        user={actionFor?.user ?? null}
        onClose={() => setActionFor(null)}
        onDone={refetchUsers}
      />
    </>
  )
}

const UserRow: React.FC<{
  user: AuthUser
  onOpen: () => void
  onAction: (action: UserAction) => void
  onUnbanned: () => void
}> = ({ user, onOpen, onAction, onUnbanned }) => (
  <CardRow
    testId="user-row"
    onClick={onOpen}
    leading={
      <Avatar src={user.image ?? undefined} size={40} color="blue">
        {asI18n((user.name ?? user.email).slice(0, 1).toUpperCase())}
      </Avatar>
    }
    title={asI18n(user.name || user.email)}
    badges={<UserStatusBadge user={user} />}
    meta={user.name ? asI18n(user.email) : undefined}
    trailing={
      <>
        {user.createdAt && (
          <Text size="sm" c="dimmed" ta="right" visibleFrom="sm">
            {m.users_joined({
              date: asI18n(new Date(user.createdAt).toLocaleDateString()),
            })}
          </Text>
        )}
        <UserActionsMenu
          user={user}
          onAction={onAction}
          onUnbanned={onUnbanned}
        />
      </>
    }
  />
)
