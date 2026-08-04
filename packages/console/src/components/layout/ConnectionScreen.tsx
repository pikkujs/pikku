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
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n, type I18nString } from '@pikku/react'
import { consoleLogoUrl } from '@/lib/assets'

function getErrorGuidance(
  error: string,
  url: string
): { title: I18nString; hint: I18nString } {
  const lower = error.toLowerCase()
  if (
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('failed to fetch')
  ) {
    return {
      title: m.connection_errors_connection_refused(),
      hint: m.connection_hints_connection_refused({ url }),
    }
  }
  if (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('rpc function')
  ) {
    return {
      title: m.connection_errors_addon_not_found(),
      hint: m.connection_hints_addon_not_found(),
    }
  }
  if (lower.includes('cors') || lower.includes('cross-origin')) {
    return {
      title: m.connection_errors_cors_error(),
      hint: m.connection_hints_cors_error(),
    }
  }
  if (lower.includes('timeout')) {
    return {
      title: m.connection_errors_timeout(),
      hint: m.connection_hints_timeout(),
    }
  }
  return {
    title: m.connection_errors_connection_failed(),
    hint: asI18n(error),
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
            title={guidance.title}
            w="100%"
          >
            <Text size="sm">{guidance.hint}</Text>
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
