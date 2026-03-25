import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  Badge,
  Group,
  Stack,
  Drawer,
  Button,
  Center,
  Loader,
  Table,
  TextInput,
  Alert,
  Code,
  SegmentedControl,
} from '@mantine/core'
import {
  Circle,
  Trash2,
  AlertTriangle,
  KeyRound,
  Link2,
  Search,
  Users,
} from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface CredentialMeta {
  name: string
  displayName: string
  description?: string
  type: 'singleton' | 'wire'
  isOAuth2: boolean
}

interface UserEntry {
  userId: string
  credentials: Record<string, boolean>
}

type FilterValue = 'all' | 'connected' | 'not-connected'

export const CredentialUsersTab: React.FunctionComponent = () => {
  const { meta, loading: metaLoading } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const [selectedUser, setSelectedUser] = useState<UserEntry | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterValue>('all')

  const allCredentials = useMemo(() => {
    const creds = (meta as any).credentialsMeta ?? {}
    return Object.entries(creds).map(
      ([name, data]: [string, any]) =>
        ({
          name,
          displayName: data.displayName || name,
          description: data.description,
          type: data.type || 'singleton',
          isOAuth2: !!data.oauth2,
        }) as CredentialMeta
    )
  }, [meta])

  const perUserCredentials = useMemo(
    () => allCredentials.filter((c) => c.type === 'wire'),
    [allCredentials]
  )

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['credential-list-users'],
    queryFn: async () => {
      try {
        const result = await (rpc as any).invoke(
          'console:credentialListUsers',
          null
        )
        return (result.users ?? []) as UserEntry[]
      } catch {
        return []
      }
    },
    enabled: perUserCredentials.length > 0,
  })

  const loading = metaLoading || usersLoading
  const users = usersData ?? []

  const filteredUsers = useMemo(() => {
    let result = users
    if (search) {
      result = result.filter((u) =>
        u.userId.toLowerCase().includes(search.toLowerCase())
      )
    }
    if (filter === 'connected') {
      result = result.filter((u) =>
        Object.values(u.credentials).some(Boolean)
      )
    } else if (filter === 'not-connected') {
      result = result.filter(
        (u) => !Object.values(u.credentials).some(Boolean)
      )
    }
    return result
  }, [users, search, filter])

  const connectedCount = users.filter((u) =>
    Object.values(u.credentials).some(Boolean)
  ).length

  if (loading) {
    return (
      <Center h={300}>
        <Loader size="sm" />
      </Center>
    )
  }

  if (perUserCredentials.length === 0) {
    return (
      <Center h={300}>
        <Stack align="center" gap="sm">
          <Users size={40} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed" size="sm" ta="center">
            No per-user credentials declared.
            <br />
            Use <Code>wireCredential({"{ type: 'wire' }"})</Code> to declare
            per-user credentials.
          </Text>
        </Stack>
      </Center>
    )
  }

  const showColumns = perUserCredentials.length <= 5

  return (
    <Box p="md">
      {/* Summary bar */}
      <Group gap="lg" mb="md">
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            Credentials:
          </Text>
          <Badge size="sm" variant="light">
            {perUserCredentials.length}
          </Badge>
        </Group>
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            Users:
          </Text>
          <Badge size="sm" variant="light">
            {users.length}
          </Badge>
        </Group>
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            Connected:
          </Text>
          <Badge size="sm" variant="light" color="teal">
            {connectedCount}
          </Badge>
        </Group>
        {users.length > 0 && (
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              Adoption:
            </Text>
            <Badge size="sm" variant="light" color="blue">
              {Math.round((connectedCount / users.length) * 100)}%
            </Badge>
          </Group>
        )}
      </Group>

      {/* Filters */}
      <Group justify="space-between" mb="md">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={(v) => setFilter(v as FilterValue)}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Connected', value: 'connected' },
            { label: 'Not connected', value: 'not-connected' },
          ]}
        />
        {users.length > 5 && (
          <TextInput
            placeholder="Search users..."
            size="xs"
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={200}
          />
        )}
      </Group>

      {users.length === 0 ? (
        <Text size="sm" c="dimmed">
          No users have configured credentials yet.
        </Text>
      ) : (
        <Table highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ fontSize: 12 }}>User ID</Table.Th>
              {showColumns ? (
                perUserCredentials.map((cred) => (
                  <Table.Th
                    key={cred.name}
                    style={{ fontSize: 12, textAlign: 'center' }}
                  >
                    {cred.displayName}
                  </Table.Th>
                ))
              ) : (
                <Table.Th style={{ fontSize: 12, textAlign: 'center' }}>
                  Connected
                </Table.Th>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredUsers.map((user) => {
              const connCount = Object.values(user.credentials).filter(
                Boolean
              ).length

              return (
                <Table.Tr
                  key={user.userId}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedUser(user)}
                >
                  <Table.Td>
                    <Text size="xs" ff="monospace">
                      {user.userId}
                    </Text>
                  </Table.Td>
                  {showColumns ? (
                    perUserCredentials.map((cred) => (
                      <Table.Td
                        key={cred.name}
                        style={{ textAlign: 'center' }}
                      >
                        <Circle
                          size={8}
                          fill={
                            user.credentials[cred.name]
                              ? 'var(--mantine-color-teal-6)'
                              : 'transparent'
                          }
                          color={
                            user.credentials[cred.name]
                              ? 'var(--mantine-color-teal-6)'
                              : 'var(--mantine-color-gray-4)'
                          }
                          style={{ display: 'inline-block' }}
                        />
                      </Table.Td>
                    ))
                  ) : (
                    <Table.Td style={{ textAlign: 'center' }}>
                      <Badge
                        size="xs"
                        variant="light"
                        color={connCount > 0 ? 'teal' : 'gray'}
                      >
                        {connCount} / {perUserCredentials.length}
                      </Badge>
                    </Table.Td>
                  )}
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      )}

      <Drawer
        opened={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        position="right"
        size="md"
        title={`User: ${selectedUser?.userId}`}
      >
        {selectedUser && (
          <UserDrawer
            user={selectedUser}
            credentialsMeta={perUserCredentials}
            onClose={() => setSelectedUser(null)}
          />
        )}
      </Drawer>
    </Box>
  )
}

const UserDrawer: React.FunctionComponent<{
  user: UserEntry
  credentialsMeta: CredentialMeta[]
  onClose: () => void
}> = ({ user, credentialsMeta, onClose }) => {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  const revokeMutation = useMutation({
    mutationFn: async (credName: string) => {
      await (rpc as any).invoke('console:credentialDelete', {
        name: credName,
        userId: user.userId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['credential-list-users'],
      })
    },
  })

  const connectedCreds = credentialsMeta.filter(
    (c) => user.credentials[c.name]
  )
  const missingCreds = credentialsMeta.filter(
    (c) => !user.credentials[c.name]
  )

  const totalCount = credentialsMeta.length
  const connectedCount = connectedCreds.length

  return (
    <Stack gap="md">
      <Text size="xs" c="dimmed" ff="monospace">
        {user.userId}
      </Text>

      <Badge size="sm" variant="light" color={connectedCount > 0 ? 'teal' : 'gray'}>
        {connectedCount} of {totalCount} credentials connected
      </Badge>

      {connectedCreds.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb="xs">
            Connected
          </Text>
          <Stack gap="xs">
            {connectedCreds.map((cred) => (
              <Group
                key={cred.name}
                justify="space-between"
                p="xs"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              >
                <Group gap="xs">
                  {cred.isOAuth2 ? (
                    <Link2 size={14} color="var(--mantine-color-dimmed)" />
                  ) : (
                    <KeyRound size={14} color="var(--mantine-color-dimmed)" />
                  )}
                  <Box>
                    <Text size="sm" fw={500}>
                      {cred.displayName}
                    </Text>
                    <Badge
                      size="xs"
                      variant="light"
                      color={cred.isOAuth2 ? 'violet' : 'blue'}
                    >
                      {cred.isOAuth2 ? 'OAuth2' : 'API Key'}
                    </Badge>
                  </Box>
                </Group>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  leftSection={<Trash2 size={12} />}
                  onClick={() => revokeMutation.mutate(cred.name)}
                  loading={revokeMutation.isPending}
                >
                  Revoke
                </Button>
              </Group>
            ))}
          </Stack>
        </Box>
      )}

      {missingCreds.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb="xs" c="dimmed">
            Not Connected
          </Text>
          <Stack gap="xs">
            {missingCreds.map((cred) => (
              <Group
                key={cred.name}
                gap="xs"
                p="xs"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  opacity: 0.5,
                }}
              >
                {cred.isOAuth2 ? (
                  <Link2 size={14} color="var(--mantine-color-dimmed)" />
                ) : (
                  <KeyRound size={14} color="var(--mantine-color-dimmed)" />
                )}
                <Text size="sm" c="dimmed">
                  {cred.displayName}
                </Text>
              </Group>
            ))}
          </Stack>
        </Box>
      )}

      {connectedCount === 0 && (
        <Text size="xs" c="dimmed" mt="xs">
          This user hasn't connected any credentials yet. Credentials are
          configured when users interact with your agent or connect through the
          auth flow.
        </Text>
      )}

      {revokeMutation.isError && (
        <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
          {String(
            (revokeMutation.error as any)?.message || revokeMutation.error
          )}
        </Alert>
      )}
    </Stack>
  )
}
