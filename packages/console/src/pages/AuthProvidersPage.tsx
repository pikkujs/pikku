import React, { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Collapse,
  CopyButton,
  Divider,
  Group,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'

// ─── Provider catalog ─────────────────────────────────────────────────────────

export interface AuthProviderField {
  key: string
  label: string
  placeholder?: string
  hint?: string
  multiline?: boolean
}

export interface AuthProviderDef {
  id: string
  name: string
  /** Auth.js provider id used in the callback URL path segment */
  callbackId: string
  description: string
  setupUrl: string
  setupLabel: string
  /** Environment variables required to enable this provider */
  fields: AuthProviderField[]
  /** If true, shown in the default (top) table */
  featured?: boolean
}

const PROVIDERS: AuthProviderDef[] = [
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
    setupUrl: 'https://developer.apple.com/account/resources/identifiers/list/serviceId',
    setupLabel: 'Configure Service ID on Apple Developer',
    fields: [
      { key: 'AUTH_APPLE_ID', label: 'Service ID (Client ID)' },
      { key: 'AUTH_APPLE_TEAM_ID', label: 'Team ID' },
      {
        key: 'AUTH_APPLE_PRIVATE_KEY',
        label: 'Private Key (.p8)',
        placeholder: '-----BEGIN PRIVATE KEY-----\n…',
        multiline: true,
      },
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
    callbackId: 'microsoft-entra-id',
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
      { key: 'AUTH_OKTA_ISSUER', label: 'Issuer URL', placeholder: 'https://your-org.okta.com' },
    ],
  },
]

const FEATURED = PROVIDERS.filter((p) => p.featured)
const EXTRA = PROVIDERS.filter((p) => !p.featured)

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AuthProvidersPageProps {
  /**
   * Read a single secret by env-var name.
   * Returns `{ exists: false }` when the key has never been set.
   */
  onReadSecret(name: string): Promise<{ exists: boolean; value?: unknown }>
  /** Persist a secret. Value is the raw string entered by the user. */
  onSaveSecret(name: string, value: string): Promise<void>
  /** Delete / clear a secret (set to empty). */
  onDeleteSecret(name: string): Promise<void>
  /**
   * Base URL of the stage/environment, used to construct the auth.js callback
   * URL shown to the user. E.g. `https://my-app.workers.dev`.
   */
  stageUrl?: string
}

// ─── Status cache ─────────────────────────────────────────────────────────────

type ProviderStatus = 'loading' | 'configured' | 'partial' | 'unconfigured'

function useProviderStatuses(
  providers: AuthProviderDef[],
  onReadSecret: AuthProvidersPageProps['onReadSecret'],
) {
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>(() =>
    Object.fromEntries(providers.map((p) => [p.id, 'loading'])),
  )

  const refresh = useCallback(
    async (ids?: string[]) => {
      const toCheck = ids ? providers.filter((p) => ids.includes(p.id)) : providers
      const results = await Promise.all(
        toCheck.map(async (p) => {
          const checks = await Promise.all(p.fields.map((f) => onReadSecret(f.key)))
          const set = checks.filter((c) => c.exists).length
          const status: ProviderStatus =
            set === 0 ? 'unconfigured' : set === p.fields.length ? 'configured' : 'partial'
          return [p.id, status] as const
        }),
      )
      setStatuses((prev) => ({ ...prev, ...Object.fromEntries(results) }))
    },
    [providers, onReadSecret],
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  return { statuses, refresh }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProviderStatus }) {
  if (status === 'loading')
    return (
      <Badge size="sm" variant="dot" color="gray">
        checking
      </Badge>
    )
  if (status === 'configured')
    return (
      <Badge size="sm" variant="dot" color="teal">
        enabled
      </Badge>
    )
  if (status === 'partial')
    return (
      <Badge size="sm" variant="dot" color="yellow">
        incomplete
      </Badge>
    )
  return (
    <Badge size="sm" variant="dot" color="gray">
      not set
    </Badge>
  )
}

// ─── Configure drawer (inline panel) ─────────────────────────────────────────

interface ConfigurePanelProps {
  provider: AuthProviderDef
  stageUrl?: string
  onSaveSecret: AuthProvidersPageProps['onSaveSecret']
  onDeleteSecret: AuthProvidersPageProps['onDeleteSecret']
  onReadSecret: AuthProvidersPageProps['onReadSecret']
  onDone: () => void
}

function ConfigurePanel({
  provider,
  stageUrl,
  onSaveSecret,
  onDeleteSecret,
  onReadSecret,
  onDone,
}: ConfigurePanelProps) {
  const callbackUrl = stageUrl
    ? `${stageUrl.replace(/\/$/, '')}/api/auth/callback/${provider.callbackId}`
    : `/api/auth/callback/${provider.callbackId}`

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((f) => [f.key, ''])),
  )
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    Promise.all(
      provider.fields.map(async (f) => {
        const r = await onReadSecret(f.key)
        return [f.key, r.exists] as const
      }),
    ).then((results) => {
      if (cancelled) return
      setExistingKeys(new Set(results.filter(([, exists]) => exists).map(([k]) => k)))
    })
    return () => {
      cancelled = true
    }
  }, [provider, onReadSecret])

  const handleSave = async () => {
    setSaving(true)
    try {
      await Promise.all(
        provider.fields
          .filter((f) => values[f.key].trim())
          .map((f) => onSaveSecret(f.key, values[f.key].trim())),
      )
      onDone()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await Promise.all(provider.fields.map((f) => onDeleteSecret(f.key)))
      onDone()
    } finally {
      setRemoving(false)
    }
  }

  const hasAnyValue = provider.fields.some((f) => values[f.key].trim())
  const isConfigured = existingKeys.size === provider.fields.length

  return (
    <Stack gap="md">
      {/* Callback URL */}
      <Paper
        withBorder
        p="sm"
        style={{ background: 'var(--app-panel-bg, var(--mantine-color-default))' }}
      >
        <Text fz={11} fw={600} tt="uppercase" lts="0.1em" c="dimmed" mb={6}>
          Callback URL
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Text fz={13} ff="monospace" style={{ flex: 1, wordBreak: 'break-all' }}>
            {callbackUrl}
          </Text>
          <CopyButton value={callbackUrl}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                <ActionIcon
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  size="sm"
                  onClick={copy}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
        <Text fz={12} c="dimmed" mt={6}>
          Register this as the authorized redirect URI when setting up your OAuth app.
        </Text>
      </Paper>

      {/* Setup link */}
      <Group gap="xs">
        <ExternalLink size={13} />
        <Text
          component="a"
          href={provider.setupUrl}
          target="_blank"
          rel="noreferrer"
          fz={13}
          c="blue"
          style={{ textDecoration: 'underline', cursor: 'pointer' }}
        >
          {provider.setupLabel}
        </Text>
      </Group>

      <Divider />

      {/* Secret fields */}
      <Stack gap="sm">
        {provider.fields.map((field) => (
          <Box key={field.key}>
            <Text fz={12} fw={500} mb={4}>
              {field.label}
              {existingKeys.has(field.key) && (
                <Badge size="xs" variant="light" color="teal" ml={6}>
                  set
                </Badge>
              )}
            </Text>
            <PasswordInput
              placeholder={
                existingKeys.has(field.key)
                  ? 'Leave blank to keep existing'
                  : (field.placeholder ?? `Enter ${field.label}`)
              }
              value={values[field.key]}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.currentTarget.value }))}
              ff="monospace"
              fz={13}
            />
            <Text fz={11} c="dimmed" mt={3}>
              env: <code>{field.key}</code>
            </Text>
          </Box>
        ))}
      </Stack>

      <Alert icon={<ShieldCheck size={14} />} color="blue" variant="light" py="xs">
        <Text fz={12}>
          Secrets are encrypted at rest and injected as environment variables at runtime. Your
          application reads them via auth.js — no code changes needed once set.
        </Text>
      </Alert>

      <Group justify="space-between" mt="xs">
        {isConfigured ? (
          <Button
            variant="subtle"
            color="red"
            size="xs"
            leftSection={<Trash2 size={13} />}
            loading={removing}
            onClick={handleRemove}
          >
            Remove provider
          </Button>
        ) : (
          <Box />
        )}
        <Group gap="sm">
          <Button variant="subtle" color="gray" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!hasAnyValue}
            loading={saving}
            onClick={handleSave}
          >
            Save secrets
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}

// ─── Provider row ─────────────────────────────────────────────────────────────

interface ProviderRowProps {
  provider: AuthProviderDef
  status: ProviderStatus
  expanded: boolean
  onToggle: () => void
  stageUrl?: string
  onSaveSecret: AuthProvidersPageProps['onSaveSecret']
  onDeleteSecret: AuthProvidersPageProps['onDeleteSecret']
  onReadSecret: AuthProvidersPageProps['onReadSecret']
  onRefresh: () => void
}

function ProviderRow({
  provider,
  status,
  expanded,
  onToggle,
  stageUrl,
  onSaveSecret,
  onDeleteSecret,
  onReadSecret,
  onRefresh,
}: ProviderRowProps) {
  return (
    <Box>
      <UnstyledButton
        onClick={onToggle}
        style={{ width: '100%', borderRadius: 8 }}
      >
        <Paper
          withBorder
          p="sm"
          style={{
            borderColor: expanded
              ? 'var(--mantine-color-blue-5)'
              : status === 'configured'
                ? 'var(--mantine-color-teal-7)'
                : undefined,
          }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon
                size="md"
                variant="light"
                color={status === 'configured' ? 'teal' : 'gray'}
                radius="sm"
              >
                <KeyRound size={14} />
              </ThemeIcon>
              <Box>
                <Text size="sm" fw={500}>
                  {provider.name}
                </Text>
                <Text fz={12} c="dimmed">
                  {provider.description}
                </Text>
              </Box>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <StatusBadge status={status} />
              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </Group>
          </Group>
        </Paper>
      </UnstyledButton>

      <Collapse in={expanded}>
        <Paper withBorder p="md" mt={-1} style={{ borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          <ConfigurePanel
            provider={provider}
            stageUrl={stageUrl}
            onSaveSecret={onSaveSecret}
            onDeleteSecret={onDeleteSecret}
            onReadSecret={onReadSecret}
            onDone={() => {
              onRefresh()
              onToggle()
            }}
          />
        </Paper>
      </Collapse>
    </Box>
  )
}

// ─── Extra providers grid ─────────────────────────────────────────────────────

interface ExtraProviderCardProps {
  provider: AuthProviderDef
  status: ProviderStatus
  onSelect: () => void
}

function ExtraProviderCard({ provider, status, onSelect }: ExtraProviderCardProps) {
  return (
    <UnstyledButton onClick={onSelect} style={{ width: '100%' }}>
      <Paper
        withBorder
        p="sm"
        style={{
          height: '100%',
          borderColor: status === 'configured' ? 'var(--mantine-color-teal-7)' : undefined,
        }}
      >
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Box>
            <Text size="sm" fw={500}>
              {provider.name}
            </Text>
            <Text fz={11} c="dimmed" mt={2}>
              {provider.description}
            </Text>
          </Box>
          <StatusBadge status={status} />
        </Group>
      </Paper>
    </UnstyledButton>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const AuthProvidersPage: React.FC<AuthProvidersPageProps> = ({
  onReadSecret,
  onSaveSecret,
  onDeleteSecret,
  stageUrl,
}) => {
  const allProviders = [...FEATURED, ...EXTRA]
  const { statuses, refresh } = useProviderStatuses(allProviders, onReadSecret)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showMore, { toggle: toggleMore }] = useDisclosure(false)

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id))

  return (
    <PageContainer
      header={
        <PageHeader
          title="Auth Providers"
          subtitle="Enable OAuth sign-in providers for this stage. Secrets are encrypted and injected at runtime — auth.js picks them up automatically."
          docsHref="https://authjs.dev/getting-started/providers"
        />
      }
    >
      {/* Featured providers */}
      <Stack gap="xs">
        {FEATURED.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            status={statuses[provider.id] ?? 'loading'}
            expanded={expandedId === provider.id}
            onToggle={() => toggle(provider.id)}
            stageUrl={stageUrl}
            onSaveSecret={onSaveSecret}
            onDeleteSecret={onDeleteSecret}
            onReadSecret={onReadSecret}
            onRefresh={() => refresh([provider.id])}
          />
        ))}
      </Stack>

      {/* Show more toggle */}
      <Box mt="md">
        <UnstyledButton
          onClick={toggleMore}
          style={{ width: '100%' }}
        >
          <Group gap="xs" c="dimmed">
            {showMore ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Text fz={13} fw={500}>
              {showMore ? 'Show fewer providers' : `Show ${EXTRA.length} more providers`}
            </Text>
          </Group>
        </UnstyledButton>

        <Collapse in={showMore}>
          <Box mt="sm">
            {expandedId && EXTRA.find((p) => p.id === expandedId) ? (
              // If an extra provider is expanded, show it full-width
              <Stack gap="xs">
                {EXTRA.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    status={statuses[provider.id] ?? 'loading'}
                    expanded={expandedId === provider.id}
                    onToggle={() => toggle(provider.id)}
                    stageUrl={stageUrl}
                    onSaveSecret={onSaveSecret}
                    onDeleteSecret={onDeleteSecret}
                    onReadSecret={onReadSecret}
                    onRefresh={() => refresh([provider.id])}
                  />
                ))}
              </Stack>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
                {EXTRA.map((provider) => (
                  <ExtraProviderCard
                    key={provider.id}
                    provider={provider}
                    status={statuses[provider.id] ?? 'loading'}
                    onSelect={() => {
                      toggle(provider.id)
                    }}
                  />
                ))}
              </SimpleGrid>
            )}
          </Box>
        </Collapse>
      </Box>
    </PageContainer>
  )
}
