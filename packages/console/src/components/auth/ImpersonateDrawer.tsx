import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Drawer,
  Stack,
  TextInput,
  Text,
  Group,
  Avatar,
  UnstyledButton,
  Loader,
  Center,
  Alert,
  Box,
} from '@pikku/mantine/core'
import { Search, AlertTriangle } from 'lucide-react'
import { useDebouncedValue } from '@mantine/hooks'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { useAuth, type AuthUser } from '../../context/AuthContext'

export const ImpersonateDrawer: React.FC<{
  opened: boolean
  onClose: () => void
}> = ({ opened, onClose }) => {
  useLocale()
  const { listUsers, impersonate, user: currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced] = useDebouncedValue(search, 250)

  const usersQuery = useQuery({
    queryKey: ['impersonate-users', debounced],
    queryFn: () => listUsers(debounced || undefined),
    enabled: opened,
  })

  const impersonateMutation = useMutation({
    mutationFn: (userId: string) => impersonate(userId),
  })

  // Don't offer to impersonate yourself.
  const users = (usersQuery.data ?? []).filter((u) => u.id !== currentUser?.id)

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={m.impersonate_title()}
      position="right"
    >
      <Stack gap="sm">
        <TextInput
          leftSection={<Search size={16} />}
          placeholder={m.impersonate_search_placeholder()}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          autoFocus
        />

        {impersonateMutation.error && (
          <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
            <Text size="sm">
              {asI18n((impersonateMutation.error as Error).message)}
            </Text>
          </Alert>
        )}

        {usersQuery.isLoading ? (
          <Center py="xl">
            <Loader size="sm" />
          </Center>
        ) : usersQuery.error ? (
          <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
            <Text size="sm">{asI18n((usersQuery.error as Error).message)}</Text>
          </Alert>
        ) : users.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {m.impersonate_empty()}
          </Text>
        ) : (
          <Stack gap={4}>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                disabled={impersonateMutation.isPending}
                onClick={() => impersonateMutation.mutate(u.id)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Drawer>
  )
}

const UserRow: React.FC<{
  user: AuthUser
  disabled: boolean
  onClick: () => void
}> = ({ user, disabled, onClick }) => (
  <UnstyledButton
    onClick={onClick}
    disabled={disabled}
    p="xs"
    style={{
      borderRadius: 6,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <Group gap="sm" wrap="nowrap">
      <Avatar src={user.image ?? undefined} radius="xl" size="sm">
        {(user.name ?? user.email).slice(0, 1).toUpperCase()}
      </Avatar>
      <Box style={{ minWidth: 0 }}>
        {user.name && (
          <Text size="sm" fw={500} truncate>
            {asI18n(user.name)}
          </Text>
        )}
        <Text size="xs" c="dimmed" truncate>
          {asI18n(user.email)}
        </Text>
      </Box>
    </Group>
  </UnstyledButton>
)
