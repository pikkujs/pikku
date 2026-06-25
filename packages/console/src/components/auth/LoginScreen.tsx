import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Center,
  Stack,
  Paper,
  Box,
  TextInput,
  PasswordInput,
  Button,
  Text,
  Alert,
} from '@pikku/mantine/core'
import { AlertTriangle } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { useAuth } from '../../context/AuthContext'

export const LoginScreen: React.FC = () => {
  useLocale()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => signIn(email, password),
  })

  return (
    <Center h="100vh">
      <Paper p="xl" radius="lg" maw={420} w="100%" withBorder>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          <Stack gap="lg">
            <Box>
              <Center>
                <img
                  src="/pikku-console-logo.png"
                  alt="Pikku Console"
                  width={48}
                  height={48}
                />
              </Center>
              <Text size="xl" fw={500} ta="center" mt="xs">
                {m.auth_sign_in()}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {m.auth_sign_in_subtitle()}
              </Text>
            </Box>

            {mutation.error && (
              <Alert
                icon={<AlertTriangle size={16} />}
                color="red"
                variant="light"
              >
                <Text size="sm">{asI18n((mutation.error as Error).message)}</Text>
              </Alert>
            )}

            <TextInput
              label={m.auth_email()}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
              autoFocus
            />
            <PasswordInput
              label={m.auth_password()}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />

            <Button type="submit" fullWidth loading={mutation.isPending}>
              {m.auth_sign_in()}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
