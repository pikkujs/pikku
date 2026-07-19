import React, { useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { AlertTriangle, Check, Circle, KeyRound, Link2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { asI18n } from '@pikku/react'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useOptionalAuth } from '../../context/AuthContext'
import { useSetSecret } from '../../hooks/useSecrets'

interface CredentialEntry {
  name: string
  displayName?: string
  description?: string
  type?: string
  oauth2?: unknown
}

interface SecretEntry {
  name: string
  displayName?: string
  description?: string
  secretId: string
}

const CRED_STATUS_KEY = 'addon-setup-cred-status'

export const AddonSetupTab: React.FC<{
  credentials: Record<string, CredentialEntry>
  secrets: Record<string, SecretEntry>
  // The selected instance's overrides, if any: they remap the addon's logical
  // credential name / secretId to the actual project name this instance reads.
  // Absent (or no matching entry) → the addon's own name/id is used.
  credentialOverrides?: Record<string, string>
  secretOverrides?: Record<string, string>
}> = ({ credentials, secrets, credentialOverrides, secretOverrides }) => {
  useLocale()
  const rpc = usePikkuRPC()

  // Overrides key on the credential NAME / secretId the addon reads by.
  const resolveCred = (name: string) => credentialOverrides?.[name] ?? name
  const resolveSecret = (secretId: string) =>
    secretOverrides?.[secretId] ?? secretId

  const oauthCreds = Object.values(credentials ?? {}).filter((c) => !!c.oauth2)
  const secretList = Object.values(secrets ?? {})

  // One batched status call for every OAuth integration the addon declares,
  // against this instance's RESOLVED provider names.
  const resolvedCredNames = oauthCreds.map((c) => resolveCred(c.name))
  const { data: credStatus } = useQuery({
    queryKey: [CRED_STATUS_KEY, [...resolvedCredNames].sort()],
    queryFn: async () => {
      const result = await rpc.invoke('console:credentialStatus', {
        names: resolvedCredNames,
      })
      return (result.statuses ?? {}) as Record<string, boolean>
    },
    enabled: oauthCreds.length > 0,
  })

  if (oauthCreds.length === 0 && secretList.length === 0) {
    return (
      <Box p="md">
        <Text c="dimmed" size="sm">
          {m.addon_setup_none()}
        </Text>
      </Box>
    )
  }

  return (
    <Box p="md">
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {m.addon_setup_intro()}
        </Text>

        {oauthCreds.length > 0 && (
          <Stack gap="sm">
            <Text fw={600} size="sm">
              {m.addon_setup_oauth_heading()}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {oauthCreds.map((cred) => {
                const resolvedName = resolveCred(cred.name)
                return (
                  <OAuthRequirementCard
                    key={cred.name}
                    credential={cred}
                    resolvedName={resolvedName}
                    isConnected={credStatus?.[resolvedName] === true}
                  />
                )
              })}
            </SimpleGrid>
          </Stack>
        )}

        {secretList.length > 0 && (
          <Stack gap="sm">
            <Text fw={600} size="sm">
              {m.addon_setup_secrets_heading()}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {secretList.map((secret) => (
                <SecretRequirementCard
                  key={secret.name}
                  secret={secret}
                  resolvedSecretId={resolveSecret(secret.secretId)}
                />
              ))}
            </SimpleGrid>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

const StatusDot: React.FC<{
  ok: boolean
  okLabel: I18nNode
  badLabel: I18nNode
}> = ({ ok, okLabel, badLabel }) => (
  <Group gap={6}>
    {ok ? (
      <Circle
        size={8}
        fill="var(--mantine-color-teal-6)"
        color="var(--mantine-color-teal-6)"
      />
    ) : (
      <Circle size={8} color="var(--mantine-color-gray-5)" />
    )}
    <Text size="sm" c={ok ? 'teal.6' : 'dimmed'}>
      {ok ? okLabel : badLabel}
    </Text>
  </Group>
)

const OAuthRequirementCard: React.FC<{
  credential: CredentialEntry
  // The provider name this instance actually links/reads (== credential.name
  // unless the instance overrides it).
  resolvedName: string
  isConnected: boolean
}> = ({ credential, resolvedName, isConnected }) => {
  useLocale()
  const rpc = usePikkuRPC()
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()
  const showResolved = resolvedName !== credential.name

  // A singleton OAuth credential is platform-owned: linking it flows through the
  // admin-gated /credential-oauth/link endpoint then a full-page redirect back.
  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await auth!.client.$fetch<{ url?: string }>(
        '/credential-oauth/link',
        {
          method: 'POST',
          body: {
            providerId: resolvedName,
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

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await rpc.invoke('console:credentialDelete', { name: resolvedName })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRED_STATUS_KEY] })
    },
  })

  return (
    <Card shadow="xs" padding="lg" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {asI18n(credential.displayName ?? credential.name)}
          </Text>
          <Link2 size={16} color="var(--mantine-color-dimmed)" />
        </Group>

        {credential.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {asI18n(credential.description)}
          </Text>
        )}

        {showResolved && (
          <Text size="xs" c="dimmed" ff="monospace">
            {asI18n(resolvedName)}
          </Text>
        )}

        <Badge size="sm" variant="light" color="violet">
          {m.credentials_type_oauth2()}
        </Badge>

        <StatusDot
          ok={isConnected}
          okLabel={m.credentials_connected()}
          badLabel={m.credentials_not_connected()}
        />

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

        {connectMutation.isError && (
          <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
            {asI18n(String((connectMutation.error as Error)?.message ?? ''))}
          </Alert>
        )}
      </Stack>
    </Card>
  )
}

const SecretRequirementCard: React.FC<{
  secret: SecretEntry
  // The project secret this instance reads (== secret.secretId unless overridden).
  resolvedSecretId: string
}> = ({ secret, resolvedSecretId }) => {
  useLocale()
  const rpc = usePikkuRPC()
  const setSecret = useSetSecret()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const { data: status } = useQuery({
    queryKey: ['addon-setup-secret-status', resolvedSecretId],
    queryFn: async () => {
      const result = (await rpc.invoke('pikkuConsoleGetSecret', {
        secretId: resolvedSecretId,
      })) as { exists: boolean }
      return { exists: result?.exists === true }
    },
  })

  const isSet = status?.exists === true

  const save = () => {
    setSecret.mutate(
      { secretId: resolvedSecretId, value },
      {
        onSuccess: () => {
          setEditing(false)
          setValue('')
        },
      }
    )
  }

  return (
    <Card shadow="xs" padding="lg" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {asI18n(secret.displayName ?? secret.name)}
          </Text>
          <KeyRound size={16} color="var(--mantine-color-dimmed)" />
        </Group>

        {secret.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {asI18n(secret.description)}
          </Text>
        )}

        <Text size="xs" c="dimmed" ff="monospace">
          {asI18n(resolvedSecretId)}
        </Text>

        <StatusDot
          ok={isSet}
          okLabel={m.addon_setup_secret_set()}
          badLabel={m.addon_setup_secret_not_set()}
        />

        {editing ? (
          <Stack gap="xs" mt={4}>
            <TextInput
              size="xs"
              type="password"
              value={value}
              placeholder={m.addon_setup_secret_placeholder()}
              onChange={(e) => setValue(e.currentTarget.value)}
              autoFocus
            />
            <Group gap="xs">
              <Button
                size="compact-xs"
                onClick={save}
                loading={setSecret.isPending}
                disabled={value.length === 0}
                leftSection={<Check size={12} />}
              >
                {m.addon_setup_secret_save()}
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setEditing(false)
                  setValue('')
                }}
              >
                {m.common_cancel()}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Box mt={4}>
            <Button
              size="compact-xs"
              variant={isSet ? 'light' : undefined}
              onClick={() => setEditing(true)}
              leftSection={<KeyRound size={12} />}
            >
              {isSet
                ? m.addon_setup_secret_update_action()
                : m.addon_setup_secret_set_action()}
            </Button>
          </Box>
        )}

        {setSecret.isError && (
          <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
            {asI18n(String((setSecret.error as Error)?.message ?? ''))}
          </Alert>
        )}
      </Stack>
    </Card>
  )
}
