import React from 'react'
import { Text, Badge, Group, Stack, Box, Button, Alert } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Trash2, AlertTriangle, KeyRound, Link2 } from 'lucide-react'
import { usePikkuRPC } from '../../../context/PikkuRpcProvider'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface CredentialMeta {
  name: string
  displayName: string
  isOAuth2: boolean
}

export const CredentialUserPanel: React.FC<{
  userId: string
  metadata?: {
    credentials: Record<string, boolean>
    credentialsMeta: CredentialMeta[]
  }
}> = ({ userId, metadata }) => {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  const credentialsMeta = metadata?.credentialsMeta ?? []
  const userCreds = metadata?.credentials ?? {}

  const connectedCreds = credentialsMeta.filter((c) => userCreds[c.name])
  const missingCreds = credentialsMeta.filter((c) => !userCreds[c.name])

  const revokeMutation = useMutation({
    mutationFn: async (credName: string) => {
      await rpc.invoke('console:credentialDelete', {
        name: credName,
        userId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['credential-list-users'],
      })
    },
  })

  return (
    <Stack gap="md" pt="md">
      <Badge
        size="sm"
        variant="light"
        color={connectedCreds.length > 0 ? 'teal' : 'gray'}
      >
        {asI18n(`${connectedCreds.length} of ${credentialsMeta.length} credentials connected`)}
      </Badge>

      {connectedCreds.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb="xs">
            {asI18n('Connected')}
          </Text>
          <Stack gap="xs">
            {connectedCreds.map((cred) => (
              <Group
                key={cred.name}
                justify="space-between"
                p="xs"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              >
                <Group gap="xs">
                  {cred.isOAuth2 ? (
                    <Link2 size={14} color="var(--mantine-color-dimmed)" />
                  ) : (
                    <KeyRound size={14} color="var(--mantine-color-dimmed)" />
                  )}
                  <Box>
                    <Text size="sm" fw={500}>
                      {asI18n(cred.displayName)}
                    </Text>
                    <Badge
                      size="sm"
                      variant="light"
                      color={cred.isOAuth2 ? 'violet' : 'blue'}
                    >
                      {asI18n(cred.isOAuth2 ? 'OAuth2' : 'API Key')}
                    </Badge>
                  </Box>
                </Group>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  leftSection={<Trash2 size={12} />}
                  onClick={() => revokeMutation.mutate(cred.name)}
                  loading={revokeMutation.isPending}
                >
                  {asI18n('Revoke')}
                </Button>
              </Group>
            ))}
          </Stack>
        </Box>
      )}

      {missingCreds.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb="xs" c="dimmed">
            {asI18n('Not Connected')}
          </Text>
          <Stack gap="xs">
            {missingCreds.map((cred) => (
              <Group
                key={cred.name}
                justify="space-between"
                p="xs"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  opacity: 0.7,
                }}
              >
                <Group gap="xs">
                  {cred.isOAuth2 ? (
                    <Link2 size={14} color="var(--mantine-color-dimmed)" />
                  ) : (
                    <KeyRound size={14} color="var(--mantine-color-dimmed)" />
                  )}
                  <Text size="sm" c="dimmed">
                    {asI18n(cred.displayName)}
                  </Text>
                </Group>
              </Group>
            ))}
          </Stack>
        </Box>
      )}

      {connectedCreds.length === 0 && !missingCreds.some((c) => c.isOAuth2) && (
        <Text size="sm" c="dimmed">
          {asI18n("This user hasn't connected any credentials yet.")}
        </Text>
      )}

      {revokeMutation.isError && (
        <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
          {asI18n(String(
            (revokeMutation.error as any)?.message || 'An error occurred'
          ))}
        </Alert>
      )}
    </Stack>
  )
}
