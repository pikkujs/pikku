import { useState } from 'react'
import {
  Center,
  Stack,
  TextInput,
  Button,
  Text,
  Paper,
  Box,
} from '@mantine/core'
import { getServerUrl, setServerUrl } from '@/context/PikkuRpcProvider'

export const ConnectionScreen: React.FunctionComponent<{ error: string }> = ({
  error,
}) => {
  const [url, setUrl] = useState(getServerUrl)

  const handleReconnect = () => {
    setServerUrl(url.trim())
    window.location.reload()
  }

  return (
    <Center h="100vh" bg="dark.9">
      <Paper p="xl" radius="md" maw={420} w="100%" bg="dark.7">
        <Stack gap="lg" align="center">
          <Box>
            <Center>
              <img
                src="/pikku-console-logo.png"
                alt="Pikku Console"
                width={48}
                height={48}
              />
            </Center>
            <Text size="xl" fw={500} ta="center" mt="xs" c="white">
              Pikku Console
            </Text>
          </Box>

          <Text c="red.4" size="sm" ta="center">
            {error}
          </Text>

          <TextInput
            label="Pikku instance URL"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            w="100%"
            styles={{
              label: { color: 'var(--mantine-color-gray-4)' },
            }}
          />

          <Button fullWidth onClick={handleReconnect}>
            Reconnect
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
