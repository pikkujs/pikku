import React, { useMemo, useState } from 'react'
import { Group, Text, Badge, TextInput } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { KeyRound, Search } from 'lucide-react'
import { PanelProvider } from '../context/PanelContext'
import { usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ConfiguredBadge } from '../components/auth/ConfiguredBadge'
import { AuthPluginsBar } from '../components/auth/AuthPluginsBar'
import { useAuthProviders } from '../hooks/useAuthProviders'

// ─── Provider catalog ─────────────────────────────────────────────────────────

export interface AuthProviderField {
  key: string
  label: string
  placeholder?: string
}

export interface AuthProviderDef {
  id: string
  name: string
  /** Better Auth provider id used in the callback URL path segment */
  callbackId: string
  description: string
  setupUrl: string
  setupLabel: string
  fields: AuthProviderField[]
  featured?: boolean
}

export const AUTH_PROVIDERS: AuthProviderDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    callbackId: 'github',
    description: 'Sign in with GitHub OAuth.',
    setupUrl: 'https://github.com/settings/applications/new',
    setupLabel: 'New OAuth App on GitHub',
    fields: [
      { key: 'AUTH_GITHUB_ID', label: 'Client ID' },
      { key: 'AUTH_GITHUB_SECRET', label: 'Client Secret' },
    ],
    featured: true,
  },
  {
    id: 'google',
    name: 'Google',
    callbackId: 'google',
    description: 'Sign in with Google OAuth.',
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupLabel: 'Create credentials on Google Cloud',
    fields: [
      { key: 'AUTH_GOOGLE_ID', label: 'Client ID' },
      { key: 'AUTH_GOOGLE_SECRET', label: 'Client Secret' },
    ],
    featured: true,
  },
  {
    id: 'apple',
    name: 'Apple',
    callbackId: 'apple',
    description: 'Sign in with Apple ID.',
    setupUrl:
      'https://developer.apple.com/account/resources/identifiers/list/serviceId',
    setupLabel: 'Configure Service ID on Apple Developer',
    fields: [
      { key: 'AUTH_APPLE_ID', label: 'Service ID (Client ID)' },
      { key: 'AUTH_APPLE_TEAM_ID', label: 'Team ID' },
      { key: 'AUTH_APPLE_PRIVATE_KEY', label: 'Private Key (.p8)' },
    ],
    featured: true,
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    callbackId: 'bitbucket',
    description: 'Sign in with Bitbucket OAuth.',
    setupUrl: 'https://bitbucket.org/account/settings/app-passwords/',
    setupLabel: 'Create OAuth consumer on Bitbucket',
    fields: [
      { key: 'AUTH_BITBUCKET_ID', label: 'Client ID (Key)' },
      { key: 'AUTH_BITBUCKET_SECRET', label: 'Client Secret' },
    ],
    featured: true,
  },
  {
    id: 'discord',
    name: 'Discord',
    callbackId: 'discord',
    description: 'Sign in with Discord.',
    setupUrl: 'https://discord.com/developers/applications',
    setupLabel: 'Create application on Discord Developer Portal',
    fields: [
      { key: 'AUTH_DISCORD_ID', label: 'Client ID' },
      { key: 'AUTH_DISCORD_SECRET', label: 'Client Secret' },
    ],
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    callbackId: 'twitter',
    description: 'Sign in with X (formerly Twitter).',
    setupUrl: 'https://developer.twitter.com/en/portal/dashboard',
    setupLabel: 'Create project on Twitter Developer Portal',
    fields: [
      { key: 'AUTH_TWITTER_ID', label: 'Client ID' },
      { key: 'AUTH_TWITTER_SECRET', label: 'Client Secret' },
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    callbackId: 'linkedin',
    description: 'Sign in with LinkedIn.',
    setupUrl: 'https://www.linkedin.com/developers/apps',
    setupLabel: 'Create app on LinkedIn Developer Portal',
    fields: [
      { key: 'AUTH_LINKEDIN_ID', label: 'Client ID' },
      { key: 'AUTH_LINKEDIN_SECRET', label: 'Client Secret' },
    ],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    callbackId: 'spotify',
    description: 'Sign in with Spotify.',
    setupUrl: 'https://developer.spotify.com/dashboard',
    setupLabel: 'Create app on Spotify Developer Dashboard',
    fields: [
      { key: 'AUTH_SPOTIFY_ID', label: 'Client ID' },
      { key: 'AUTH_SPOTIFY_SECRET', label: 'Client Secret' },
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    callbackId: 'facebook',
    description: 'Sign in with Facebook.',
    setupUrl: 'https://developers.facebook.com/apps',
    setupLabel: 'Create app on Facebook for Developers',
    fields: [
      { key: 'AUTH_FACEBOOK_ID', label: 'App ID' },
      { key: 'AUTH_FACEBOOK_SECRET', label: 'App Secret' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    callbackId: 'slack',
    description: 'Sign in with Slack.',
    setupUrl: 'https://api.slack.com/apps',
    setupLabel: 'Create app on Slack API',
    fields: [
      { key: 'AUTH_SLACK_ID', label: 'Client ID' },
      { key: 'AUTH_SLACK_SECRET', label: 'Client Secret' },
    ],
  },
  {
    id: 'microsoft-entra-id',
    name: 'Microsoft / Azure AD',
    callbackId: 'microsoft',
    description: 'Sign in with Microsoft Entra ID (Azure AD).',
    setupUrl:
      'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    setupLabel: 'Register app on Azure Portal',
    fields: [
      { key: 'AUTH_MICROSOFT_ENTRA_ID_ID', label: 'Client ID' },
      { key: 'AUTH_MICROSOFT_ENTRA_ID_SECRET', label: 'Client Secret' },
      { key: 'AUTH_MICROSOFT_ENTRA_ID_TENANT_ID', label: 'Tenant ID' },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    callbackId: 'notion',
    description: 'Sign in with Notion.',
    setupUrl: 'https://www.notion.so/my-integrations',
    setupLabel: 'Create integration on Notion',
    fields: [
      { key: 'AUTH_NOTION_ID', label: 'OAuth Client ID' },
      { key: 'AUTH_NOTION_SECRET', label: 'OAuth Client Secret' },
    ],
  },
  {
    id: 'okta',
    name: 'Okta',
    callbackId: 'okta',
    description: 'Sign in with Okta.',
    setupUrl: 'https://developer.okta.com/',
    setupLabel: 'Create app integration on Okta',
    fields: [
      { key: 'AUTH_OKTA_ID', label: 'Client ID' },
      { key: 'AUTH_OKTA_SECRET', label: 'Client Secret' },
      { key: 'AUTH_OKTA_ISSUER', label: 'Issuer URL' },
    ],
  },
]

// Email+password is not an OAuth provider, but it shows up in the same list so
// the SSO page reflects every configured sign-in method. It is synthesized into
// the table and marked configured from `hasCredentials`.
const CREDENTIALS_PROVIDER: AuthProviderDef = {
  id: 'credentials',
  name: 'Credentials',
  callbackId: 'credentials',
  description: 'Email and password sign-in.',
  setupUrl: 'https://www.better-auth.com/docs/authentication/email-password',
  setupLabel: 'Better Auth email & password docs',
  fields: [],
}

// ─── Table ────────────────────────────────────────────────────────────────────

const AuthProvidersTable: React.FC<{ searchQuery: string }> = ({
  searchQuery,
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
          <ConfiguredBadge
            configured={isConfigured(p)}
            testId={`auth-provider-configured-${p.name.toLowerCase()}`}
          />
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
      onRowClick={(p) => openAuthProvider(p.id, p)}
      externalSearch={searchQuery}
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
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const AuthProvidersPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  useLocale()

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.auth_providers_title()}
            description={m.auth_providers_description()}
            docsHref="https://www.better-auth.com/docs/concepts/oauth"
            filters={
              <TextInput
                placeholder={m.auth_providers_search_placeholder()}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
            }
          />
        }
        emptyPanelMessage={m.auth_providers_select_provider()}
      >
        <AuthProvidersTable searchQuery={searchQuery} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
