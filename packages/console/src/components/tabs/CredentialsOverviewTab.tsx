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
} from '@mantine/core'
import { KeyRound, Link2, Circle } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { useQuery } from '@tanstack/react-query'

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
    return Object.entries(creds).map(
      ([name, data]: [string, any]) =>
        ({
          name,
          displayName: data.displayName || name,
          description: data.description,
          type: data.type || 'singleton',
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
        const result = await (rpc as any).invoke('console:credentialStatus', {
          names: singletons.map((c) => c.name),
        })
        return (result.statuses ?? {}) as Record<string, boolean>
      } catch {
        return {}
      }
    },
    enabled: credentials.length > 0,
  })

  const { data: usersData } = useQuery({
    queryKey: ['credential-list-users'],
    queryFn: async () => {
      try {
        const result = await (rpc as any).invoke(
          'console:credentialListUsers',
          null
        )
        return (result.users ?? []) as Array<{
          userId: string
          credentials: Record<string, boolean>
        }>
      } catch {
        return []
      }
    },
    enabled: credentials.some((c) => c.type === 'wire'),
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

  const getUserCount = (credName: string) => {
    if (!usersData) return 0
    return usersData.filter((u) => u.credentials[credName]).length
  }

  return (
    <Box p="md">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {credentials.map((cred) => {
          const isGlobal = cred.type === 'singleton'
          const isConnected = isGlobal
            ? globalStatus?.[cred.name] === true
            : false
          const connectedUsers = isGlobal ? null : getUserCount(cred.name)
          const totalUsers = isGlobal ? null : (usersData?.length ?? 0)

          return (
            <Card key={cred.name} shadow="xs" padding="lg" radius="md" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600} size="sm">
                    {cred.displayName}
                  </Text>
                  {cred.isOAuth2 ? (
                    <Link2 size={16} color="var(--mantine-color-dimmed)" />
                  ) : (
                    <KeyRound size={16} color="var(--mantine-color-dimmed)" />
                  )}
                </Group>

                {cred.description && (
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {cred.description}
                  </Text>
                )}

                <Group gap="xs">
                  <Badge
                    size="xs"
                    variant="light"
                    color={cred.isOAuth2 ? 'violet' : 'blue'}
                  >
                    {cred.isOAuth2 ? 'OAuth2' : 'API Key'}
                  </Badge>
                  <Badge
                    size="xs"
                    variant="light"
                    color={isGlobal ? 'gray' : 'blue'}
                  >
                    {isGlobal ? 'Global' : 'Per-user'}
                  </Badge>
                </Group>

                <Group gap={6} mt={4}>
                  {isGlobal ? (
                    isConnected ? (
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
                    )
                  ) : (
                    <Text size="xs" c="dimmed">
                      {connectedUsers} / {totalUsers} users connected
                    </Text>
                  )}
                </Group>
              </Stack>
            </Card>
          )
        })}
      </SimpleGrid>
    </Box>
  )
}
