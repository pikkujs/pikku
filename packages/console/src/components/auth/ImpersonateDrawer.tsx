import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Drawer,
  Stack,
  TextInput,
  Text,
  Loader,
  Center,
  Alert,
} from '@pikku/mantine/core'
import { Search, AlertTriangle } from 'lucide-react'
import { useDebouncedValue } from '@mantine/hooks'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { useAuth, type AuthUser } from '../../context/AuthContext'
import { useImpersonation } from '../../context/ImpersonationContext'
import { ImpersonateUserRow } from './ImpersonateUserRow'

export const ImpersonateDrawer: React.FC<{
  opened: boolean
  onClose: () => void
}> = ({ opened, onClose }) => {
  useLocale()
  const { listUsers, user: currentUser } = useAuth()
  const { setTarget, target } = useImpersonation()
  const [search, setSearch] = useState('')
  const [debounced] = useDebouncedValue(search, 250)

  const usersQuery = useQuery({
    queryKey: ['impersonate-users', debounced],
    queryFn: () => listUsers(debounced || undefined),
    enabled: opened,
  })

  const users = (usersQuery.data ?? []).filter((u) => u.id !== currentUser?.id)

  const select = (u: AuthUser) => {
    setTarget(u)
    onClose()
  }

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
          data-testid="impersonate-search"
          autoFocus
        />

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
              <ImpersonateUserRow
                key={u.id}
                user={u}
                active={target?.id === u.id}
                onClick={() => select(u)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Drawer>
  )
}
