import React, { useMemo } from 'react'
import { Box, Group, Button, Alert, Text, Stack } from '@pikku/mantine/core'
import { Link2, Circle, AlertTriangle } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '../../router'
import { useOptionalAuth } from '../../context/AuthContext'
import { EntityCardList } from '../layout/EntityCardList'
import type { EntityCardItem } from '../layout/EntityCardList'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

interface ConnectableCredential {
  name: string
  displayName: string
  description?: string
}

interface CredentialOwner {
  packageName: string
  namespace: string
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
  const rpc = usePikkuRPC()
  const auth = useOptionalAuth()
  const navigate = useNavigate()

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

  // credential name → owning addon, from the installed addons' declared
  // credentials — shared shape with the Global tab.
  const { data: owners } = useQuery({
    queryKey: ['credential-owners'],
    queryFn: async () => {
      const installed = (await rpc.invoke('console:getInstalledAddons')) as Array<{
        packageName: string
        namespace: string
      }>
      const map: Record<string, CredentialOwner> = {}
      await Promise.all(
        (installed ?? []).map(async (addon) => {
          const pkg = (await rpc.invoke('console:getAddonInstalledPackage', {
            packageName: addon.packageName,
          })) as { credentials?: Record<string, unknown> } | null
          for (const credName of Object.keys(pkg?.credentials ?? {})) {
            map[credName] = {
              packageName: addon.packageName,
              namespace: addon.namespace,
            }
          }
        })
      )
      return map
    },
    enabled: allCredentials.length > 0,
    staleTime: 60 * 1000,
  })

  const credentials = useMemo(() => {
    if (!searchQuery) return allCredentials
    const q = searchQuery.toLowerCase()
    return allCredentials.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        owners?.[c.name]?.namespace.toLowerCase().includes(q)
    )
  }, [allCredentials, searchQuery, owners])

  const byName = useMemo(
    () => new Map(credentials.map((c) => [c.name, c])),
    [credentials]
  )

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

  const items = useMemo(
    (): EntityCardItem[] =>
      credentials.map((cred) => {
        const owner = owners?.[cred.name]
        return {
          name: cred.name,
          displayName: cred.displayName,
          description: cred.description,
          badges: [
            { label: m.credentials_type_oauth2(), tone: 'accent' as const },
          ],
          tags: owner ? [owner.namespace] : undefined,
        }
      }),
    [credentials, owners]
  )

  return (
    <Box p="md">
      <Stack gap="md">
        {!auth?.user && (
          <Alert color="yellow" variant="light">
            {m.credentials_connections_signed_out()}
          </Alert>
        )}
        <EntityCardList
          items={items}
          loading={false}
          icon={Link2}
          emptyHero={emptyHero}
          emptyTitle={m.credentials_connections_empty_title()}
          emptyDescription={m.credentials_connections_empty_description()}
          docsHref="https://pikku.dev/docs/core-features/credentials"
          onOpen={(name) => {
            const owner = owners?.[name]
            if (owner) {
              navigate(
                `/addons?id=${encodeURIComponent(owner.packageName)}&source=installed`
              )
            }
          }}
          metricSlot={(name) => {
            const cred = byName.get(name)
            if (!cred) return null
            return (
              <ConnectionRowActions
                credential={cred}
                isConnected={linkedProviders?.has(name) ?? false}
                disabled={!auth?.user}
              />
            )
          }}
        />
      </Stack>
    </Box>
  )
}

const ConnectionRowActions: React.FC<{
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

  // Clicks on the action buttons must not also trigger the row's onOpen.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <Group gap="sm" wrap="nowrap" onClick={stop}>
      <Group gap={6} wrap="nowrap">
        {isConnected ? (
          <Circle
            size={8}
            fill="var(--mantine-color-teal-6)"
            color="var(--mantine-color-teal-6)"
          />
        ) : (
          <Circle size={8} color="var(--mantine-color-gray-5)" />
        )}
        <Text size="sm" c={isConnected ? 'teal.6' : 'dimmed'}>
          {isConnected ? m.credentials_connected() : m.credentials_not_connected()}
        </Text>
      </Group>

      {isConnected ? (
        <Group gap="xs" wrap="nowrap">
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

      {error && (
        <Alert
          color="red"
          variant="light"
          icon={<AlertTriangle size={14} />}
          p="xs"
        >
          {asI18n(String((error as any)?.message || error))}
        </Alert>
      )}
    </Group>
  )
}
