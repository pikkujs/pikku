import { useState } from 'react'
import {
  Center,
  Stack,
  TextInput,
  Button,
  Text,
  Paper,
  Box,
  Alert,
} from '@mantine/core'
import { AlertTriangle } from 'lucide-react'
import { getServerUrl, setServerUrl } from '@/context/PikkuRpcProvider'

function getErrorGuidance(error: string, url: string): { title: string; hint: string } {
  const lower = error.toLowerCase()
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('econnrefused') || lower.includes('failed to fetch')) {
    return {
      title: 'Connection refused',
      hint: `Make sure your Pikku server is running at ${url}`,
    }
  }
  if (lower.includes('404') || lower.includes('not found') || lower.includes('rpc function')) {
    return {
      title: 'Console addon not found',
      hint: 'The @pikku/addon-console package may not be installed. Add it to your project and run pikku to generate the bootstrap.',
    }
  }
  if (lower.includes('cors') || lower.includes('cross-origin')) {
    return {
      title: 'CORS error',
      hint: 'Your Pikku server may need CORS configured to allow requests from the console origin.',
    }
  }
  if (lower.includes('timeout')) {
    return {
      title: 'Request timed out',
      hint: 'The server took too long to respond. Check if it is under heavy load or unreachable.',
    }
  }
  return {
    title: 'Connection failed',
    hint: error,
  }
}

export const ConnectionScreen: React.FunctionComponent<{ error: string }> = ({
  error,
}) => {
  const [url, setUrl] = useState(getServerUrl)
  const guidance = getErrorGuidance(error, url)

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

          <Alert
            icon={<AlertTriangle size={16} />}
            color="red"
            variant="light"
            title={guidance.title}
            w="100%"
          >
            <Text size="sm">{guidance.hint}</Text>
          </Alert>

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
