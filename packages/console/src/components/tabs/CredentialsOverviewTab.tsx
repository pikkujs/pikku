import React, { useMemo } from 'react'
import { Box, Group, Button, Alert, Text } from '@pikku/mantine/core'
import { KeyRound, Link2, Circle, AlertTriangle } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useOptionalAuth } from '../../context/AuthContext'
import { useNavigate } from '../../router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { EntityCardList } from '../layout/EntityCardList'
import type { EntityCardItem } from '../layout/EntityCardList'
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

// Which addon (if any) declares each credential — so a row can show its origin
// and clicking it can jump to that addon's setup. Built from the installed
// addons and their declared credentials, so it stays accurate as addons change.
interface CredentialOwner {
  packageName: string
  namespace: string
}

export const CredentialsOverviewTab: React.FC<{
  searchQuery?: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery = '', emptyHero }) => {
  useLocale()
  const { meta } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const navigate = useNavigate()

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

  // credential name → owning addon, derived from the installed addons' declared
  // credentials (each getAddonInstalledPackage returns its `credentials`).
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

  const { data: globalStatus } = useQuery({
    queryKey: ['credential-global-status'],
    queryFn: async () => {
      const singletons = allCredentials.filter((c) => c.type === 'singleton')
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

  const items = useMemo(
    (): EntityCardItem[] =>
      credentials.map((cred) => {
        const owner = owners?.[cred.name]
        return {
          name: cred.name,
          displayName: cred.displayName,
          description: cred.description,
          badges: [
            {
              label: cred.isOAuth2
                ? m.credentials_type_oauth2()
                : m.credentials_type_api_key(),
              tone: cred.isOAuth2 ? ('accent' as const) : ('neutral' as const),
            },
          ],
          tags: owner ? [owner.namespace] : undefined,
        }
      }),
    [credentials, owners]
  )

  return (
    <Box p="md">
      <EntityCardList
        items={items}
        loading={false}
        icon={KeyRound}
        emptyHero={emptyHero}
        emptyTitle={m.credentials_empty_title()}
        emptyDescription={m.credentials_empty_description()}
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
            <CredentialRowActions
              credential={cred}
              isConnected={globalStatus?.[name] === true}
            />
          )
        }}
      />
    </Box>
  )
}

const CredentialRowActions: React.FC<{
  credential: CredentialMeta
  isConnected: boolean
}> = ({ credential, isConnected }) => {
  useLocale()
  const rpc = usePikkuRPC()
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()

  // A singleton credential belongs to the platform: linking it rebinds the
  // token for every user, so it flows through the admin-gated
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
      queryClient.invalidateQueries({ queryKey: ['credential-global-status'] })
    },
  })

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

      {credential.isOAuth2 &&
        (isConnected ? (
          <Group gap="xs" wrap="nowrap">
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
        ))}

      {connectMutation.isError && (
        <Alert
          color="red"
          variant="light"
          icon={<AlertTriangle size={14} />}
          p="xs"
        >
          {asI18n(
            String(
              (connectMutation.error as any)?.message || connectMutation.error
            )
          )}
        </Alert>
      )}
    </Group>
  )
}
