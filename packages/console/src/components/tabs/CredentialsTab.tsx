import React, { useMemo, useState, useCallback } from 'react'
import {
  SimpleGrid,
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Box,
  Drawer,
  Button,
  TextInput,
  Code,
  Divider,
  Center,
  Loader,
  SegmentedControl,
  Alert,
  Table,
} from '@mantine/core'
import {
  KeyRound,
  Link2,
  Check,
  Circle,
  AlertTriangle,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import styles from '../ui/console.module.css'

interface CredentialItem {
  name: string
  displayName: string
  description?: string
  type: 'singleton' | 'wire'
  isOAuth2: boolean
  oauth2?: {
    authorizationUrl: string
    tokenUrl: string
    scopes: string[]
    tokenSecretId: string
    appCredentialSecretId: string
  }
}

type FilterValue = 'all' | 'connected' | 'disconnected'

export const CredentialsTab: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()
  const [selectedCredential, setSelectedCredential] =
    useState<CredentialItem | null>(null)
  const [filter, setFilter] = useState<FilterValue>('all')

  const credentials = useMemo(() => {
    const credsMeta = (meta as any).credentialsMeta
    if (!credsMeta) return []
    return Object.entries(credsMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        displayName: data.displayName || name,
        description: data.description,
        type: data.type || 'singleton',
        isOAuth2: !!data.oauth2,
        oauth2: data.oauth2,
      })
    )
  }, [meta])

  if (loading) {
    return (
      <Center h={300}>
        <Loader size="sm" />
      </Center>
    )
  }

  if (credentials.length === 0) {
    return (
      <Center h={300}>
        <Stack align="center" gap="sm">
          <KeyRound size={40} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed" size="sm" ta="center">
            No credentials declared yet.
            <br />
            Use <Code>wireCredential()</Code> in your code to declare
            credentials.
          </Text>
        </Stack>
      </Center>
    )
  }

  return (
    <Box p="md">
      <Group justify="space-between" mb="md">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={(v) => setFilter(v as FilterValue)}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Connected', value: 'connected' },
            { label: 'Disconnected', value: 'disconnected' },
          ]}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {credentials.map((cred) => (
          <CredentialCard
            key={cred.name}
            credential={cred}
            filter={filter}
            onClick={() => setSelectedCredential(cred)}
          />
        ))}
      </SimpleGrid>

      <Drawer
        opened={!!selectedCredential}
        onClose={() => setSelectedCredential(null)}
        position="right"
        size="md"
        title={selectedCredential?.displayName}
      >
        {selectedCredential && (
          <CredentialDrawer
            credential={selectedCredential}
            onClose={() => setSelectedCredential(null)}
          />
        )}
      </Drawer>
    </Box>
  )
}

const CredentialCard: React.FunctionComponent<{
  credential: CredentialItem
  filter: FilterValue
  onClick: () => void
}> = ({ credential, filter, onClick }) => {
  const rpc = usePikkuRPC()

  const { data: statusData } = useQuery({
    queryKey: ['credential-status', credential.name],
    queryFn: async () => {
      try {
        const result = await rpc.invoke(
          'console:credentialStatus',
          { names: [credential.name] }
        )
        return result.statuses[credential.name] ?? false
      } catch {
        return false
      }
    },
  })

  const isConnected = statusData === true

  if (filter === 'connected' && !isConnected) return null
  if (filter === 'disconnected' && isConnected) return null

  return (
    <Card
      shadow="xs"
      padding="lg"
      radius="md"
      withBorder
      className={styles.clickableText}
      onClick={onClick}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {credential.displayName}
          </Text>
          {credential.isOAuth2 ? (
            <Link2 size={16} color="var(--mantine-color-dimmed)" />
          ) : (
            <KeyRound size={16} color="var(--mantine-color-dimmed)" />
          )}
        </Group>

        {credential.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {credential.description}
          </Text>
        )}

        <Group gap="xs">
          <Badge
            size="xs"
            variant="light"
            color={credential.isOAuth2 ? 'violet' : 'blue'}
          >
            {credential.isOAuth2 ? 'OAuth2' : 'API Key'}
          </Badge>
          <Badge
            size="xs"
            variant="light"
            color={credential.type === 'wire' ? 'blue' : 'gray'}
          >
            {credential.type === 'wire' ? 'Per-user' : 'Global'}
          </Badge>
        </Group>

        <Group gap={6} mt={4}>
          {isConnected ? (
            <>
              <Circle
                size={8}
                fill="var(--mantine-color-teal-6)"
                color="var(--mantine-color-teal-6)"
              />
              <Text size="xs" c="teal.6">
                Connected
              </Text>
            </>
          ) : (
            <>
              <Circle size={8} color="var(--mantine-color-gray-5)" />
              <Text size="xs" c="dimmed">
                Not connected
              </Text>
            </>
          )}
        </Group>
      </Stack>
    </Card>
  )
}

const CredentialDrawer: React.FunctionComponent<{
  credential: CredentialItem
  onClose: () => void
}> = ({ credential, onClose }) => {
  return (
    <Stack gap="md">
      <Box>
        <Group gap="xs" mb={4}>
          <Badge
            size="sm"
            variant="light"
            color={credential.isOAuth2 ? 'violet' : 'blue'}
          >
            {credential.isOAuth2 ? 'OAuth2' : 'API Key'}
          </Badge>
          <Badge
            size="sm"
            variant="light"
            color={credential.type === 'wire' ? 'blue' : 'gray'}
          >
            {credential.type === 'wire' ? 'Per-user' : 'Global'}
          </Badge>
        </Group>
        {credential.description && (
          <Text size="sm" c="dimmed" mt="xs">
            {credential.description}
          </Text>
        )}
      </Box>

      <Divider />

      {credential.type === 'singleton' && (
        <>
          {credential.isOAuth2 ? (
            <OAuthSection credential={credential} />
          ) : (
            <ApiKeySection credential={credential} />
          )}
          <Divider />
          <DeleteSection credential={credential} onClose={onClose} />
        </>
      )}

      {credential.type === 'wire' && (
        <PerUserSection credential={credential} />
      )}
    </Stack>
  )
}

const ApiKeySection: React.FunctionComponent<{
  credential: CredentialItem
}> = ({ credential }) => {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)

  const { data: currentValue, isLoading } = useQuery({
    queryKey: ['credential-value', credential.name],
    queryFn: async () => {
      try {
        const result = await rpc.invoke('console:credentialGet', {
          name: credential.name,
        })
        return result.value
      } catch {
        return null
      }
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (newValue: string) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(newValue)
      } catch {
        parsed = { apiKey: newValue }
      }
      await rpc.invoke('console:credentialSet', {
        name: credential.name,
        value: parsed,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['credential-value', credential.name],
      })
      queryClient.invalidateQueries({
        queryKey: ['credential-status', credential.name],
      })
      setEditing(false)
      setValue('')
    },
  })

  if (isLoading) {
    return <Loader size="xs" />
  }

  const hasValue = currentValue != null

  if (hasValue && !editing) {
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Credential Value
        </Text>
        <Group gap="xs">
          <Check size={14} color="var(--mantine-color-teal-6)" />
          <Text size="sm" c="teal.6">
            Configured
          </Text>
        </Group>
        <Button
          variant="light"
          size="xs"
          onClick={() => setEditing(true)}
        >
          Replace
        </Button>
      </Stack>
    )
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {hasValue ? 'Replace Credential' : 'Set Credential'}
      </Text>
      <TextInput
        placeholder="Paste API key or JSON value..."
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        size="sm"
      />
      <Group gap="xs">
        <Button
          size="xs"
          onClick={() => saveMutation.mutate(value)}
          loading={saveMutation.isPending}
          disabled={!value.trim()}
        >
          Save
        </Button>
        {editing && (
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              setEditing(false)
              setValue('')
            }}
          >
            Cancel
          </Button>
        )}
      </Group>
      {saveMutation.isError && (
        <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
          {(saveMutation.error as Error).message}
        </Alert>
      )}
    </Stack>
  )
}

const OAuthSection: React.FunctionComponent<{
  credential: CredentialItem
}> = ({ credential }) => {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  const { data: status, isLoading } = useQuery({
    queryKey: ['oauth-status', credential.name],
    queryFn: async () => {
      try {
        return await rpc.invoke('console:oauthStatus', {
          credentialName: credential.name,
        })
      } catch {
        return { connected: false }
      }
    },
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      const result = await rpc.invoke('console:oauthConnect', {
        credentialName: credential.name,
      })
      window.open(result.authUrl, 'oauth-connect', 'width=600,height=700')
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await rpc.invoke('console:oauthDisconnect', {
        credentialName: credential.name,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['oauth-status', credential.name],
      })
      queryClient.invalidateQueries({
        queryKey: ['credential-status', credential.name],
      })
    },
  })

  if (isLoading) {
    return <Loader size="xs" />
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        OAuth2 Connection
      </Text>

      {status?.connected ? (
        <>
          <Group gap="xs">
            <Check size={14} color="var(--mantine-color-teal-6)" />
            <Text size="sm" c="teal.6">
              Connected
            </Text>
            {status.isExpired && (
              <Badge size="xs" color="orange" variant="light">
                Expired
              </Badge>
            )}
          </Group>
          {credential.oauth2?.scopes && (
            <Box>
              <Text size="xs" c="dimmed" mb={4}>
                Scopes
              </Text>
              <Group gap={4}>
                {credential.oauth2.scopes.map((scope: string) => (
                  <Badge key={scope} size="xs" variant="outline">
                    {scope}
                  </Badge>
                ))}
              </Group>
            </Box>
          )}
          <Group gap="xs" mt="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<RefreshCw size={12} />}
              onClick={() => connectMutation.mutate()}
              loading={connectMutation.isPending}
            >
              Reconnect
            </Button>
            <Button
              size="xs"
              variant="light"
              color="red"
              onClick={() => disconnectMutation.mutate()}
              loading={disconnectMutation.isPending}
            >
              Disconnect
            </Button>
          </Group>
        </>
      ) : (
        <>
          <Button
            onClick={() => connectMutation.mutate()}
            loading={connectMutation.isPending}
            leftSection={<Link2 size={14} />}
          >
            Connect {credential.displayName}
          </Button>
          {connectMutation.isError && (
            <Alert
              color="red"
              variant="light"
              icon={<AlertTriangle size={14} />}
            >
              {String(
                (connectMutation.error as any)?.message ||
                  connectMutation.error
              )}
            </Alert>
          )}
        </>
      )}
    </Stack>
  )
}

const PerUserSection: React.FunctionComponent<{
  credential: CredentialItem
}> = ({ credential }) => {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  const { data: userIds, isLoading } = useQuery({
    queryKey: ['credential-users', credential.name],
    queryFn: async () => {
      try {
        const result = await rpc.invoke('console:credentialUsers', {
          name: credential.name,
        })
        return result.userIds as string[]
      } catch {
        return []
      }
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await rpc.invoke('console:credentialDelete', {
        name: credential.name,
        userId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['credential-users', credential.name],
      })
      queryClient.invalidateQueries({
        queryKey: ['credential-status', credential.name],
      })
    },
  })

  if (isLoading) {
    return <Loader size="xs" />
  }

  const users = userIds || []

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          User Credentials
        </Text>
        <Badge size="xs" variant="light">
          {users.length} connected
        </Badge>
      </Group>

      {users.length === 0 ? (
        <Text size="xs" c="dimmed">
          No users have configured this credential yet.
        </Text>
      ) : (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ fontSize: 12 }}>User ID</Table.Th>
              <Table.Th style={{ fontSize: 12 }}>Status</Table.Th>
              <Table.Th style={{ fontSize: 12, width: 70 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((userId) => (
              <Table.Tr key={userId}>
                <Table.Td>
                  <Text size="xs" ff="monospace">
                    {userId}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Circle
                      size={6}
                      fill="var(--mantine-color-teal-6)"
                      color="var(--mantine-color-teal-6)"
                    />
                    <Text size="xs" c="teal.6">
                      Connected
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    onClick={() => revokeMutation.mutate(userId)}
                    loading={revokeMutation.isPending}
                  >
                    Revoke
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}

const DeleteSection: React.FunctionComponent<{
  credential: CredentialItem
  onClose: () => void
}> = ({ credential, onClose }) => {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await rpc.invoke('console:credentialDelete', {
        name: credential.name,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credential-status'] })
      queryClient.invalidateQueries({ queryKey: ['credential-value'] })
      onClose()
    },
  })

  return (
    <Button
      size="xs"
      variant="light"
      color="red"
      leftSection={<Trash2 size={12} />}
      onClick={() => deleteMutation.mutate()}
      loading={deleteMutation.isPending}
    >
      Delete Credential
    </Button>
  )
}
