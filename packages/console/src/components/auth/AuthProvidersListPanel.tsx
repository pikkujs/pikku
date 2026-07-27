import React, { useMemo } from 'react'
import { Group, Text, Badge } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { KeyRound } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { useAuthProviders } from '../../hooks/useAuthProviders'
import { TableListPage } from '../layout/TableListPage'
import { ConfiguredBadge } from './ConfiguredBadge'
import { AuthPluginsBar } from './AuthPluginsBar'
import {
  AUTH_PROVIDERS,
  CREDENTIALS_PROVIDER,
  type AuthProviderDef,
} from './auth-providers-catalog'

export interface AuthProvidersListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every sign-in method the console knows about, marked configured from the
 * project's auth meta. Mount anywhere under a `ConsoleSurface` — it reads its
 * own meta and opens the provider inspector.
 */
export const AuthProvidersListPanel: React.FC<AuthProvidersListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  const { openAuthProvider } = usePanelContext()
  useLocale()
  const { meta } = useAuthProviders()

  const configuredCallbackIds = useMemo(
    () => new Set(meta.providers.map((p) => p.id)),
    [meta.providers]
  )

  const isConfigured = (p: AuthProviderDef): boolean =>
    p.id === CREDENTIALS_PROVIDER.id
      ? meta.hasCredentials
      : configuredCallbackIds.has(p.callbackId)

  const data = useMemo(() => [CREDENTIALS_PROVIDER, ...AUTH_PROVIDERS], [])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'PROVIDER',
        render: (p: AuthProviderDef) => (
          <Group gap="xs">
            <KeyRound size={14} />
            <Text fw={500}>{asI18n(p.name)}</Text>
            {p.featured && (
              <Badge size="xs" variant="light" color="blue">
                {m.auth_providers_popular()}
              </Badge>
            )}
          </Group>
        ),
      },
      {
        key: 'status',
        header: 'STATUS',
        render: (p: AuthProviderDef) => (
          <ConfiguredBadge configured={isConfigured(p)} providerId={p.id} />
        ),
      },
      {
        key: 'description',
        header: 'DESCRIPTION',
        render: (p: AuthProviderDef) => (
          <Text size="sm" c="dimmed">
            {asI18n(p.description)}
          </Text>
        ),
      },
      {
        key: 'fields',
        header: 'ENV VARS',
        render: (p: AuthProviderDef) => (
          <Text size="sm" c="dimmed" ff="monospace">
            {asI18n(
              `${p.fields.length} secret${p.fields.length !== 1 ? 's' : ''}`
            )}
          </Text>
        ),
      },
    ],
    [meta]
  )

  return (
    <TableListPage
      icon={KeyRound}
      title="Auth Providers"
      docsHref="https://www.better-auth.com/docs/concepts/oauth"
      data={data}
      columns={columns}
      getKey={(p) => p.id}
      getRowProps={(p) => ({
        'data-testid': 'auth-provider-row',
        'data-provider': p.id,
      })}
      onRowClick={(p) => openAuthProvider(p.id, p)}
      externalSearch={externalSearch}
      searchFilter={(p, q) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      }
      description={
        meta.plugins.length > 0 ? (
          <AuthPluginsBar plugins={meta.plugins} />
        ) : undefined
      }
      emptyMessage={m.auth_providers_empty_message()}
      emptyHero={emptyHero}
    />
  )
}
