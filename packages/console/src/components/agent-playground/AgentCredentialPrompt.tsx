import React from 'react'
import { Center, Paper, Stack, Text, Group, Button } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { KeyRound, Link2 } from 'lucide-react'
import { getServerUrl } from '../../context/serverUrl'

export interface AgentCredentialRequirement {
  credentialName: string
  displayName: string
  addonNamespace: string
  connected: boolean
}

export interface AgentCredentialPromptProps {
  requirements: AgentCredentialRequirement[]
  onRefresh: () => void
}

export const AgentCredentialPrompt: React.FC<AgentCredentialPromptProps> = ({
  requirements,
  onRefresh,
}) => {
  useLocale()
  const serverUrl = getServerUrl()
  const missing = requirements.filter((r) => !r.connected)

  const handleConnect = (credentialName: string) => {
    const connectUrl = `${serverUrl}/credentials/${credentialName}/connect`
    const popup = window.open(
      connectUrl,
      'oauth-connect',
      'width=600,height=700'
    )
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer)
        onRefresh()
      }
    }, 500)
  }

  return (
    <Center h="100%" p="xl">
      <Paper
        withBorder
        radius="md"
        p="xl"
        maw={480}
        w="100%"
        data-testid="agent-credential-prompt"
      >
        <Stack gap="md" align="center">
          <KeyRound size={32} color="var(--mantine-color-orange-6)" />
          <Text fw={600} size="lg" ta="center">
            {m.agent_playground_connect_accounts()}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {m.agent_playground_credentials_required()}
          </Text>
          <Stack gap="xs" w="100%">
            {missing.map((req) => (
              <Group
                key={req.credentialName}
                justify="space-between"
                p="sm"
                data-testid="agent-credential-requirement"
                data-credential-name={req.credentialName}
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              >
                <Group gap="xs">
                  <Link2 size={16} color="var(--mantine-color-dimmed)" />
                  <Text size="sm" fw={500}>
                    {asI18n(req.displayName)}
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => handleConnect(req.credentialName)}
                >
                  {m.agent_playground_connect()}
                </Button>
              </Group>
            ))}
          </Stack>
        </Stack>
      </Paper>
    </Center>
  )
}
