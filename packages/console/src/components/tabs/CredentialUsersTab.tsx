import React, { useMemo } from 'react'
import { Text, Group, Badge, Center, Loader } from '@pikku/mantine/core'
import { Users, Check } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { usePanelContext } from '../../context/PanelContext'
import { useQuery } from '@tanstack/react-query'
import { TableListPage } from '../layout/TableListPage'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'

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

export const CredentialUsersTab: React.FC<{ searchQuery?: string }> = ({ searchQuery = '' }) => {
  const { meta, loading: metaLoading } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const { t } = useI18n()
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
      const result = await rpc.invoke('console:credentialListUsers')
      return (result.users ?? []) as UserEntry[]
    },
    enabled: perUserCredentials.length > 0,
  })

  const loading = metaLoading || usersLoading

  const allRows: UserRow[] = useMemo(() => {
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

  const rows = useMemo(() => {
    if (!searchQuery) return allRows
    const q = searchQuery.toLowerCase()
    return allRows.filter((row) => row.userId.toLowerCase().includes(q))
  }, [allRows, searchQuery])

  const columns = useMemo(
    () => [
      {
        key: 'userId',
        header: 'USER',
        render: (row: UserRow) => (
          <Text size="sm" ff="monospace" fw={500}>
            {asI18n(row.userId)}
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
                  size="sm"
                  variant="light"
                  color="teal"
                  leftSection={<Check size={10} />}
                >
                  {asI18n(cred.displayName)}
                </Badge>
              ) : (
                <Badge key={cred.name} size="sm" variant="light" color="gray">
                  {asI18n(cred.displayName)}
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
            {asI18n(`${row.connectedCount}/${row.totalCount}`)}
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
      <EmptyStatePlaceholder
        icon={Users}
        title={t('credential_users.empty_title')}
        description={t('credential_users.empty_description')}
        docsHref="https://pikku.dev/docs/core-features/credentials"
      />
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
      emptyMessage={t('credential_users.empty_message')}
    />
  )
}
