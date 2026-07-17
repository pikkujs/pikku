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
import { Link2, Circle, AlertTriangle } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { useOptionalAuth } from '../../context/AuthContext'
import classes from '../ui/console.module.css'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

interface ConnectableCredential {
  name: string
  displayName: string
  description?: string
}

/**
 * Per-user OAuth2 connections, backed by better-auth account linking. A
 * `wireCredential({ type: 'wire', oauth2 })` is registered by the
 * `credentialOAuth` plugin under a providerId equal to the credential name, so
 * linking an account here is what makes `getCredential(name)` resolve for this
 * user.
 *
 * Distinct from the Global tab, which connects `type: 'singleton'` credentials
 * at the platform level — those have no user to link an account to.
 */
export const CredentialConnectionsTab: React.FC<{
  searchQuery?: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery = '', emptyHero }) => {
  useLocale()
  const { meta } = usePikkuMeta()
  const auth = useOptionalAuth()

  const allCredentials = useMemo(() => {
    const creds = (meta as any).credentialsMeta ?? {}
    return Object.entries(creds)
      .filter(
        ([, data]: [string, any]) => data.type === 'wire' && !!data.oauth2
      )
      .map(
        ([name, data]: [string, any]) =>
          ({
            name,
            displayName: data.displayName || name,
            description: data.description,
          }) as ConnectableCredential
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

  // Linked accounts come from better-auth, not from a pikku RPC — better-auth
  // owns the account table, so anything else would be a second source of truth.
  const { data: linkedProviders } = useQuery({
    queryKey: ['linked-accounts', auth?.user?.id],
    enabled: !!auth?.user,
    queryFn: async () => {
      const { data } = await auth!.client.listAccounts()
      return new Set((data ?? []).map((a: any) => a.providerId as string))
    },
  })

  if (credentials.length === 0) {
    return (
      <EmptyStatePlaceholder
        title={m.credentials_connections_empty_title()}
        description={m.credentials_connections_empty_description()}
        docsHref="https://pikku.dev/docs/core-features/credentials"
        hero={emptyHero}
      />
    )
  }

  return (
    <Box className={classes.tabBody}>
      {!auth?.user && (
        <Alert color="yellow" variant="light" mb="md">
          {m.credentials_connections_signed_out()}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {credentials.map((cred) => (
          <ConnectionCard
            key={cred.name}
            credential={cred}
            isConnected={linkedProviders?.has(cred.name) ?? false}
            disabled={!auth?.user}
          />
        ))}
      </SimpleGrid>
    </Box>
  )
}

const ConnectionCard: React.FC<{
  credential: ConnectableCredential
  isConnected: boolean
  disabled: boolean
}> = ({ credential, isConnected, disabled }) => {
  useLocale()
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['linked-accounts'] })

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
      // Full-page redirect rather than a popup: the callback lands back on
      // better-auth's own origin, which a popup cannot hand back to us.
      window.location.href = data.url
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth!.client.unlinkAccount({
        providerId: credential.name,
      })
      if (error) {
        throw new Error(error.message ?? m.credentials_disconnect_failed())
      }
    },
    onSuccess: invalidate,
  })

  const error = connectMutation.error ?? disconnectMutation.error

  return (
    <Card shadow="xs" padding="lg" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {asI18n(credential.displayName)}
          </Text>
          <Link2 size={16} color="var(--mantine-color-dimmed)" />
        </Group>

        {credential.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {asI18n(credential.description)}
          </Text>
        )}

        <Badge size="sm" variant="light" color="violet">
          {m.credentials_type_oauth2()}
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

        <Box mt={4}>
          {isConnected ? (
            <Group gap="xs">
              <Button
                size="compact-xs"
                variant="light"
                disabled={disabled}
                onClick={() => connectMutation.mutate()}
                loading={connectMutation.isPending}
              >
                {m.credentials_reconnect()}
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                color="red"
                disabled={disabled}
                onClick={() => disconnectMutation.mutate()}
                loading={disconnectMutation.isPending}
              >
                {m.credentials_disconnect()}
              </Button>
            </Group>
          ) : (
            <Button
              size="compact-xs"
              disabled={disabled}
              onClick={() => connectMutation.mutate()}
              loading={connectMutation.isPending}
              leftSection={<Link2 size={12} />}
            >
              {m.credentials_connect()}
            </Button>
          )}
        </Box>

        {error && (
          <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
            {asI18n(String((error as any)?.message || error))}
          </Alert>
        )}
      </Stack>
    </Card>
  )
}
