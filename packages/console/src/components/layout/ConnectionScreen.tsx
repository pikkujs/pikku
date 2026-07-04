import { useState } from 'react'
import {
  Center,
  Stack,
  Paper,
  Box,
} from '@pikku/mantine/core'
import {
  TextInput,
  Button,
  Text,
  Alert,
} from '@pikku/mantine/core'
import { AlertTriangle } from 'lucide-react'
import { getServerUrl, setServerUrl } from '../../context/serverUrl'
import { m, mKey } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { consoleLogoUrl } from '@/lib/assets'

function getErrorGuidance(
  error: string,
  url: string
): { titleKey: string; hint: string } {
  const lower = error.toLowerCase()
  if (
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('failed to fetch')
  ) {
    return {
      titleKey: 'connection.errors.connection_refused',
      hint: `Make sure your Pikku server is running at ${url}`,
    }
  }
  if (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('rpc function')
  ) {
    return {
      titleKey: 'connection.errors.addon_not_found',
      hint: 'The @pikku/addon-console package may not be installed. Add it to your project and run pikku to generate the bootstrap.',
    }
  }
  if (lower.includes('cors') || lower.includes('cross-origin')) {
    return {
      titleKey: 'connection.errors.cors_error',
      hint: 'Your Pikku server may need CORS configured to allow requests from the console origin.',
    }
  }
  if (lower.includes('timeout')) {
    return {
      titleKey: 'connection.errors.timeout',
      hint: 'The server took too long to respond. Check if it is under heavy load or unreachable.',
    }
  }
  return {
    titleKey: 'connection.errors.connection_failed',
    hint: error,
  }
}

export const ConnectionScreen: React.FC<{ error: string }> = ({ error }) => {
  useLocale()
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
                src={consoleLogoUrl}
                alt="Pikku Console"
                width={48}
                height={48}
              />
            </Center>
            <Text size="xl" fw={500} ta="center" mt="xs">
              {m.connection_title()}
            </Text>
          </Box>

          <Alert
            icon={<AlertTriangle size={16} />}
            color="red"
            variant="light"
            title={mKey(guidance.titleKey)}
            w="100%"
          >
            <Text size="sm">{asI18n(guidance.hint)}</Text>
          </Alert>

          <TextInput
            label={m.connection_server_url_label()}
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            w="100%"
          />

          <Button fullWidth variant="default" onClick={handleReconnect}>
            {m.connection_reconnect()}
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
