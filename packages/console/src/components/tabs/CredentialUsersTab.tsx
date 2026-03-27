import React, { useMemo } from 'react'
import { Text, Group, Badge, Stack, Center, Loader, Code } from '@mantine/core'
import { Users, Check } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { usePanelContext } from '@/context/PanelContext'
import { useQuery } from '@tanstack/react-query'
import { TableListPage } from '@/components/layout/TableListPage'

interface CredentialMeta {
  name: string
  displayName: string
  type: 'singleton' | 'wire'
  isOAuth2: boolean
}

interface UserEntry {
  userId: string
  credentials: Record<string, boolean>
}

interface UserRow {
  userId: string
  credentials: Record<string, boolean>
  connectedCount: number
  totalCount: number
  isComplete: boolean
}

export const CredentialUsersTab: React.FunctionComponent = () => {
  const { meta, loading: metaLoading } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const { openCredentialUser } = usePanelContext()

  const allCredentials = useMemo(() => {
    const creds = (meta as any).credentialsMeta ?? {}
    return Object.entries(creds).map(
      ([name, data]: [string, any]) =>
        ({
          name,
          displayName: data.displayName || name,
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
      const result = await (rpc as any).invoke(
        'console:credentialListUsers',
        null
      )
      return (result.users ?? []) as UserEntry[]
    },
    enabled: perUserCredentials.length > 0,
  })

  const loading = metaLoading || usersLoading

  const rows: UserRow[] = useMemo(() => {
    if (!usersData) return []
    const total = perUserCredentials.length
    return usersData.map((u) => {
      const connected = Object.values(u.credentials).filter(Boolean).length
      return {
        ...u,
        connectedCount: connected,
        totalCount: total,
        isComplete: connected === total,
      }
    })
  }, [usersData, perUserCredentials])

  const columns = useMemo(
    () => [
      {
        key: 'userId',
        header: 'USER',
        render: (row: UserRow) => (
          <Text size="sm" ff="monospace" fw={500}>
            {row.userId}
          </Text>
        ),
      },
      {
        key: 'credentials',
        header: 'CREDENTIALS',
        render: (row: UserRow) => (
          <Group gap={6} wrap="wrap">
            {perUserCredentials.map((cred) =>
              row.credentials[cred.name] ? (
                <Badge
                  key={cred.name}
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<Check size={10} />}
                >
                  {cred.displayName}
                </Badge>
              ) : (
                <Badge
                  key={cred.name}
                  size="xs"
                  variant="light"
                  color="gray"
                >
                  {cred.displayName}
                </Badge>
              )
            )}
          </Group>
        ),
      },
      {
        key: 'status',
        header: 'STATUS',
        width: 80,
        render: (row: UserRow) => (
          <Badge
            size="sm"
            variant="light"
            color={row.isComplete ? 'teal' : 'orange'}
          >
            {row.connectedCount}/{row.totalCount}
          </Badge>
        ),
      },
    ],
    [perUserCredentials]
  )

  if (loading) {
    return (
      <Center h="100%">
        <Loader />
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

  return (
    <TableListPage
      title="Credential Users"
      icon={Users}
      docsHref="https://pikku.dev/docs/core-features/credentials"
      data={rows}
      columns={columns}
      getKey={(row) => row.userId}
      onRowClick={(row) =>
        openCredentialUser(row.userId, {
          credentials: row.credentials,
          credentialsMeta: perUserCredentials.map((c) => ({
            name: c.name,
            displayName: c.displayName,
            isOAuth2: c.isOAuth2,
          })),
        })
      }
      searchPlaceholder="Search users..."
      searchFilter={(row, q) => row.userId.toLowerCase().includes(q)}
      emptyMessage="No users have configured credentials yet."
    />
  )
}
