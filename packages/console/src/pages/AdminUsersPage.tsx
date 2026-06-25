import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Table,
  Group,
  Avatar,
  Box,
  Text,
  Badge,
  Button,
  Center,
  Loader,
  Alert,
} from '@pikku/mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { AlertTriangle, UserCog } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { useAuth, type AuthUser } from '../context/AuthContext'

export const AdminUsersPage: React.FC = () => {
  useLocale()
  const { listUsers, impersonate, user: currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced] = useDebouncedValue(search, 250)

  const usersQuery = useQuery({
    queryKey: ['admin-users', debounced],
    queryFn: () => listUsers(debounced || undefined),
  })

  const impersonateMutation = useMutation({
    mutationFn: (userId: string) => impersonate(userId),
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
      {impersonateMutation.error && (
        <Alert
          icon={<AlertTriangle size={16} />}
          color="red"
          variant="light"
          mb="md"
        >
          <Text size="sm">
            {asI18n((impersonateMutation.error as Error).message)}
          </Text>
        </Alert>
      )}

      {usersQuery.isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : usersQuery.error ? (
        <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
          <Text size="sm">{asI18n((usersQuery.error as Error).message)}</Text>
        </Alert>
      ) : users.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          {m.users_empty()}
        </Text>
      ) : (
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{m.users_col_user()}</Table.Th>
              <Table.Th>{m.users_col_role()}</Table.Th>
              <Table.Th>{m.users_col_created()}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>
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
                </Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    <Badge
                      size="sm"
                      variant="light"
                      color={u.role === 'admin' ? 'blue' : 'gray'}
                    >
                      {u.role === 'admin' ? m.users_role_admin() : m.users_role_user()}
                    </Badge>
                    {u.banned && (
                      <Badge size="sm" variant="light" color="red">
                        {m.users_banned()}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {u.createdAt
                      ? asI18n(new Date(u.createdAt).toLocaleDateString())
                      : asI18n('—')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {u.id !== currentUser?.id && (
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      leftSection={<UserCog size={14} />}
                      loading={impersonateMutation.isPending}
                      onClick={() => impersonateMutation.mutate(u.id)}
                    >
                      {m.impersonate_button()}
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </PageContainer>
  )
}
