import { useMutation } from '@tanstack/react-query'
import { Group, Text, Button, Box } from '@pikku/mantine/core'
import { UserCog } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useOptionalAuth } from '../../context/AuthContext'

/**
 * Fixed banner shown only while the session is an impersonation. Renders nothing
 * when there is no AuthProvider (e.g. inside Fabric) or no active impersonation.
 */
export const ImpersonationBanner: React.FC = () => {
  useLocale()
  const auth = useOptionalAuth()
  const mutation = useMutation({
    mutationFn: () => auth!.stopImpersonating(),
  })

  if (!auth?.impersonatedBy || !auth.user) {
    return null
  }

  return (
    <Box
      pos="fixed"
      top={0}
      left={0}
      right={0}
      px="md"
      py={6}
      style={{
        zIndex: 1000,
        backgroundColor: 'var(--mantine-color-yellow-6)',
        color: 'var(--mantine-color-black)',
      }}
    >
      <Group justify="center" gap="sm">
        <UserCog size={16} />
        <Text size="sm" fw={500}>
          {m.impersonate_banner({ email: auth.user.email })}
        </Text>
        <Button
          size="compact-xs"
          variant="filled"
          color="dark"
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {m.impersonate_stop()}
        </Button>
      </Group>
    </Box>
  )
}
