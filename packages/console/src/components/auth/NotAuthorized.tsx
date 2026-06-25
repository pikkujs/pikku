import { useMutation } from '@tanstack/react-query'
import { Center, Stack, Paper, Box, Button, Text, Alert } from '@pikku/mantine/core'
import { ShieldX } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useAuth } from '../../context/AuthContext'

export const NotAuthorized: React.FC = () => {
  useLocale()
  const { user, signOut } = useAuth()
  const mutation = useMutation({ mutationFn: () => signOut() })

  return (
    <Center h="100vh">
      <Paper p="xl" radius="lg" maw={420} w="100%" withBorder>
        <Stack gap="lg" align="center">
          <Box ta="center">
            <Center>
              <ShieldX size={48} color="var(--mantine-color-red-6)" />
            </Center>
            <Text size="xl" fw={500} mt="xs">
              {m.auth_not_authorized_title()}
            </Text>
          </Box>

          <Alert color="red" variant="light" w="100%">
            <Text size="sm">{m.auth_not_authorized_body()}</Text>
          </Alert>

          {user?.email && (
            <Text size="sm" c="dimmed">
              {m.auth_signed_in_as({ email: user.email })}
            </Text>
          )}

          <Button
            fullWidth
            variant="default"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {m.auth_sign_out()}
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
