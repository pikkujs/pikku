import {
  Badge,
  Box,
  Center,
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
import { Plus, X } from 'lucide-react'
import {
  useRoles,
  useUserRoles,
  useAddUserToRole,
  useRemoveUserFromRole,
} from '../../hooks/useScopes'

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
  const addRole = useAddUserToRole()
  const removeRole = useRemoveUserFromRole()

  const held = userRolesQuery.data?.roles ?? []
  const scopes = userRolesQuery.data?.scopes ?? []
  const available = (allRolesQuery.data?.roles ?? [])
    .map((r) => r.name)
    .filter((name) => !held.includes(name))

  const busy = addRole.isPending || removeRole.isPending

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={420}
      title={asI18n(`Roles — ${userLabel}`)}
    >
      {userRolesQuery.isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <Stack gap="md">
          <Text size="sm" fw={500}>
            {asI18n('Roles')}
          </Text>
          {held.length === 0 ? (
            <Text size="sm" c="dimmed">
              {asI18n('This user holds no roles.')}
            </Text>
          ) : (
            <Group gap={8}>
              {held.map((role) => (
                <Badge
                  key={role}
                  variant="light"
                  size="lg"
                  rightSection={
                    <X
                      size={12}
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        userId &&
                        !busy &&
                        removeRole.mutate({ userId, role })
                      }
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
                disabled={available.length === 0 || busy}
                w="fit-content"
              >
                {asI18n('Add role')}
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

          <Divider label={asI18n('Resolved scopes')} labelPosition="left" />
          {scopes.length === 0 ? (
            <Text size="sm" c="dimmed">
              {asI18n('No scopes — these roles grant nothing yet.')}
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
