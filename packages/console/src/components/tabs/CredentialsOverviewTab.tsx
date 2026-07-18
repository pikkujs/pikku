import React, { useMemo } from 'react'
import {
  SimpleGrid,
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Box,
  Button,
  Alert,
} from '@pikku/mantine/core'
import { KeyRound, Link2, Circle, AlertTriangle } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useOptionalAuth } from '../../context/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import classes from '../ui/console.module.css'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

interface CredentialMeta {
  name: string
  displayName: string
  description?: string
  type: 'singleton' | 'wire'
  isOAuth2: boolean
}

export const CredentialsOverviewTab: React.FC<{ searchQuery?: string; emptyHero?: React.ReactNode }> = ({ searchQuery = '', emptyHero }) => {
  const { meta } = usePikkuMeta()
  const rpc = usePikkuRPC()

  const allCredentials = useMemo(() => {
    const creds = (meta as any).credentialsMeta ?? {}
    return Object.entries(creds)
      .filter(
        ([, data]: [string, any]) => (data.type || 'singleton') === 'singleton'
      )
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

  const credentials = useMemo(() => {
    if (!searchQuery) return allCredentials
    const q = searchQuery.toLowerCase()
    return allCredentials.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    )
  }, [allCredentials, searchQuery])

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
    enabled: allCredentials.length > 0,
  })

  useLocale()

  if (allCredentials.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={KeyRound}
        hero={emptyHero}
        title={m.credentials_empty_title()}
        description={m.credentials_empty_description()}
        docsHref="https://pikku.dev/docs/core-features/credentials"
      />
    )
  }

  return (
    <Box className={classes.listSurfaceCard} p="md">
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

const CredentialCard: React.FC<{
  credential: CredentialMeta
  isConnected: boolean
}> = ({ credential, isConnected }) => {
  useLocale()
  const rpc = usePikkuRPC()
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()

  // A singleton credential belongs to the platform: linking it rebinds the
  // token for every user, so it flows through the same admin-gated
  // /credential-oauth/link endpoint (which links it to the reserved platform
  // user), then a full-page redirect back — a popup can't hand the callback,
  // which lands on better-auth's own origin, back to us.
  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await auth!.client.$fetch<{ url?: string }>(
        '/credential-oauth/link',
        {
          method: 'POST',
          body: {
            providerId: credential.name,
            callbackURL: window.location.href,
          },
        }
      )
      if (error) {
        throw new Error(error.message ?? m.credentials_connect_failed())
      }
      if (!data?.url) {
        throw new Error(m.credentials_connect_failed())
      }
      window.location.href = data.url
    },
  })

  // Disconnecting a platform credential goes through credentialService.delete
  // (console:credentialDelete) — the only seam that can revoke a token owned by
  // the platform user rather than the current session.
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await rpc.invoke('console:credentialDelete', { name: credential.name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['credential-global-status'],
      })
    },
  })

  return (
    <Card shadow="xs" padding="lg" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {asI18n(credential.displayName)}
          </Text>
          {credential.isOAuth2 ? (
            <Link2 size={16} color="var(--mantine-color-dimmed)" />
          ) : (
            <KeyRound size={16} color="var(--mantine-color-dimmed)" />
          )}
        </Group>

        {credential.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {asI18n(credential.description)}
          </Text>
        )}

        <Badge
          size="sm"
          variant="light"
          color={credential.isOAuth2 ? 'violet' : 'blue'}
        >
          {credential.isOAuth2 ? m.credentials_type_oauth2() : m.credentials_type_api_key()}
        </Badge>

        <Group gap={6} mt={4}>
          {isConnected ? (
            <>
              <Circle
                size={8}
                fill="var(--mantine-color-teal-6)"
                color="var(--mantine-color-teal-6)"
              />
              <Text size="sm" c="teal.6">
                {m.credentials_connected()}
              </Text>
            </>
          ) : (
            <>
              <Circle size={8} color="var(--mantine-color-gray-5)" />
              <Text size="sm" c="dimmed">
                {m.credentials_not_connected()}
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
                  disabled={!auth?.user}
                  onClick={() => connectMutation.mutate()}
                  loading={connectMutation.isPending}
                >
                  {m.credentials_reconnect()}
                </Button>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  onClick={() => disconnectMutation.mutate()}
                  loading={disconnectMutation.isPending}
                >
                  {m.credentials_disconnect()}
                </Button>
              </Group>
            ) : (
              <Button
                size="compact-xs"
                disabled={!auth?.user}
                onClick={() => connectMutation.mutate()}
                loading={connectMutation.isPending}
                leftSection={<Link2 size={12} />}
              >
                {m.credentials_connect()}
              </Button>
            )}
          </Box>
        )}

        {connectMutation.isError && (
          <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
            {asI18n(String(
              (connectMutation.error as any)?.message || connectMutation.error
            ))}
          </Alert>
        )}
      </Stack>
    </Card>
  )
}
