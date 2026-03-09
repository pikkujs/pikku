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
    <Center h="100vh">
      <Paper p="xl" radius="lg" maw={420} w="100%" withBorder>
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
            <Text size="xl" fw={500} ta="center" mt="xs">
              Pikku Console
            </Text>
          </Box>

          <Text c="dimmed" size="sm" ta="center">
            {error}
          </Text>

          <TextInput
            label="Pikku instance URL"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            w="100%"
          />

          <Button fullWidth variant="default" onClick={handleReconnect}>
            Reconnect
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
