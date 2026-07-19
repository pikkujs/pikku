import {
  Alert,
  Badge,
  Box,
  Center,
  CloseButton,
  Divider,
  Drawer,
  Group,
  Loader,
  Menu,
  Button,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Plus } from 'lucide-react'
import {
  useRoles,
  useUserRoles,
  useDeclaredScopes,
  useAddUserToRole,
  useRemoveUserFromRole,
  useAddScopeToUser,
  useRemoveScopeFromUser,
} from '../../hooks/useScopes'
import { ScopeTreeSelector } from '../scopes/ScopeTreeSelector'
import { diffScopeSelection } from '../scopes/scope-tree'
import { m } from '@/i18n/messages'

type UserRolesDrawerProps = {
  opened: boolean
  onClose: () => void
  userId: string | undefined
  userLabel: string
}

/**
 * Right drawer for granting and revoking a user's roles. The resolved scopes
 * are shown read-only — they are the union the user's session will carry, and
 * change only by editing the roles above.
 */
export const UserRolesDrawer: React.FC<UserRolesDrawerProps> = ({
  opened,
  onClose,
  userId,
  userLabel,
}) => {
  const userRolesQuery = useUserRoles(userId, opened)
  const allRolesQuery = useRoles()
  const declaredQuery = useDeclaredScopes()
  const addRole = useAddUserToRole()
  const removeRole = useRemoveUserFromRole()
  const addScope = useAddScopeToUser()
  const removeScope = useRemoveScopeFromUser()

  const held = userRolesQuery.data?.roles ?? []
  const scopes = userRolesQuery.data?.scopes ?? []
  const directScopes = userRolesQuery.data?.directScopes ?? []
  const declaredScopes = declaredQuery.data?.scopes ?? []
  const available = (allRolesQuery.data?.roles ?? [])
    .map((r) => r.name)
    .filter((name) => !held.includes(name))

  const mutationError = (addScope.error ||
    removeScope.error ||
    addRole.error ||
    removeRole.error) as Error | null

  const applyDirectScopes = (next: string[]) => {
    if (!userId) return
    const { added, removed } = diffScopeSelection(directScopes, next)
    added.forEach((scope) => addScope.mutate({ userId, scope }))
    removed.forEach((scope) => removeScope.mutate({ userId, scope }))
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={420}
      title={m.scopes_user_roles_title({ label: userLabel })}
    >
      {userRolesQuery.isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <Stack gap="md">
          {mutationError && (
            <Alert color="red" variant="light" title={m.scopes_grant_failed()}>
              {asI18n(mutationError.message)}
            </Alert>
          )}
          <Text size="sm" fw={500}>
            {m.scopes_roles_title()}
          </Text>
          {held.length === 0 ? (
            <Text size="sm" c="dimmed">
              {m.scopes_user_no_roles()}
            </Text>
          ) : (
            <Group gap={8}>
              {held.map((role) => (
                <Badge
                  key={role}
                  variant="light"
                  size="lg"
                  rightSection={
                    <CloseButton
                      size="xs"
                      aria-label={m.scopes_revoke_role({ role })}
                      disabled={!userId}
                      onClick={() => {
                        if (userId) {
                          removeRole.mutate({ userId, role })
                        }
                      }}
                    />
                  }
                >
                  {asI18n(role)}
                </Badge>
              ))}
            </Group>
          )}

          <Menu position="bottom-start" disabled={available.length === 0}>
            <Menu.Target>
              <Button
                variant="light"
                size="sm"
                leftSection={<Plus size={14} />}
                disabled={available.length === 0}
                w="fit-content"
              >
                {m.scopes_add_role()}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {available.map((role) => (
                <Menu.Item
                  key={role}
                  onClick={() =>
                    userId && addRole.mutate({ userId, role })
                  }
                >
                  {asI18n(role)}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <Divider label={m.scopes_direct_scopes()} labelPosition="left" />
          <Text size="xs" c="dimmed">
            {m.scopes_direct_scopes_hint()}
          </Text>
          <Box mah={360} style={{ overflowY: 'auto' }}>
            <ScopeTreeSelector
              scopes={declaredScopes}
              selected={directScopes}
              onChange={applyDirectScopes}
              disabled={!userId}
            />
          </Box>

          <Divider label={m.scopes_resolved_scopes()} labelPosition="left" />
          {scopes.length === 0 ? (
            <Text size="sm" c="dimmed">
              {m.scopes_no_resolved()}
            </Text>
          ) : (
            <Box>
              <Group gap={6}>
                {scopes.map((scope) => (
                  <Badge
                    key={scope}
                    variant="outline"
                    color="gray"
                    size="sm"
                    styles={{ label: { fontFamily: 'monospace' } }}
                  >
                    {asI18n(scope)}
                  </Badge>
                ))}
              </Group>
            </Box>
          )}
        </Stack>
      )}
    </Drawer>
  )
}
