import React, { useMemo } from 'react'
import {
  SimpleGrid,
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Box,
  Center,
  Code,
  Button,
  Alert,
} from '@mantine/core'
import { KeyRound, Link2, Circle, AlertTriangle } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface CredentialMeta {
  name: string
  displayName: string
  description?: string
  type: 'singleton' | 'wire'
  isOAuth2: boolean
}

export const CredentialsOverviewTab: React.FunctionComponent = () => {
  const { meta } = usePikkuMeta()
  const rpc = usePikkuRPC()

  const credentials = useMemo(() => {
    const creds = (meta as any).credentialsMeta ?? {}
    return Object.entries(creds)
      .filter(([, data]: [string, any]) => (data.type || 'singleton') === 'singleton')
      .map(
        ([name, data]: [string, any]) =>
          ({
            name,
            displayName: data.displayName || name,
            description: data.description,
            type: 'singleton',
            isOAuth2: !!data.oauth2,
          }) as CredentialMeta
      )
  }, [meta])

  const { data: globalStatus } = useQuery({
    queryKey: ['credential-global-status'],
    queryFn: async () => {
      const singletons = credentials.filter((c) => c.type === 'singleton')
      if (singletons.length === 0) return {}
      try {
        const result = await rpc.invoke('console:credentialStatus', {
          names: singletons.map((c) => c.name),
        })
        return (result.statuses ?? {}) as Record<string, boolean>
      } catch {
        return {}
      }
    },
    enabled: credentials.length > 0,
  })

  if (credentials.length === 0) {
    return (
      <Center h={300}>
        <Stack align="center" gap="sm">
          <KeyRound size={40} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed" size="sm" ta="center">
            No credentials declared yet.
            <br />
            Use <Code>wireCredential()</Code> in your code to declare
            credentials.
          </Text>
        </Stack>
      </Center>
    )
  }

  return (
    <Box p="md">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {credentials.map((cred) => (
          <CredentialCard
            key={cred.name}
            credential={cred}
            isConnected={globalStatus?.[cred.name] === true}
          />
        ))}
      </SimpleGrid>
    </Box>
  )
}

const CredentialCard: React.FunctionComponent<{
  credential: CredentialMeta
  isConnected: boolean
}> = ({ credential, isConnected }) => {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  const connectMutation = useMutation({
    mutationFn: async () => {
      const result = await rpc.invoke('console:oauthConnect', {
        credentialName: credential.name,
      })
      window.open(result.authUrl, 'oauth-connect', 'width=600,height=700')
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await rpc.invoke('console:oauthDisconnect', {
        credentialName: credential.name,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['credential-global-status'],
      })
      queryClient.invalidateQueries({ queryKey: ['oauth-status'] })
    },
  })

  return (
    <Card shadow="xs" padding="lg" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {credential.displayName}
          </Text>
          {credential.isOAuth2 ? (
            <Link2 size={16} color="var(--mantine-color-dimmed)" />
          ) : (
            <KeyRound size={16} color="var(--mantine-color-dimmed)" />
          )}
        </Group>

        {credential.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {credential.description}
          </Text>
        )}

        <Badge
          size="xs"
          variant="light"
          color={credential.isOAuth2 ? 'violet' : 'blue'}
        >
          {credential.isOAuth2 ? 'OAuth2' : 'API Key'}
        </Badge>

        <Group gap={6} mt={4}>
          {isConnected ? (
            <>
              <Circle
                size={8}
                fill="var(--mantine-color-teal-6)"
                color="var(--mantine-color-teal-6)"
              />
              <Text size="xs" c="teal.6">
                Connected
              </Text>
            </>
          ) : (
            <>
              <Circle size={8} color="var(--mantine-color-gray-5)" />
              <Text size="xs" c="dimmed">
                Not connected
              </Text>
            </>
          )}
        </Group>

        {credential.isOAuth2 && (
          <Box mt={4}>
            {isConnected ? (
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() => connectMutation.mutate()}
                  loading={connectMutation.isPending}
                >
                  Reconnect
                </Button>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  onClick={() => disconnectMutation.mutate()}
                  loading={disconnectMutation.isPending}
                >
                  Disconnect
                </Button>
              </Group>
            ) : (
              <Button
                size="compact-xs"
                onClick={() => connectMutation.mutate()}
                loading={connectMutation.isPending}
                leftSection={<Link2 size={12} />}
              >
                Connect
              </Button>
            )}
          </Box>
        )}

        {connectMutation.isError && (
          <Alert
            color="red"
            variant="light"
            icon={<AlertTriangle size={14} />}
          >
            {String(
              (connectMutation.error as any)?.message || connectMutation.error
            )}
          </Alert>
        )}
      </Stack>
    </Card>
  )
}
