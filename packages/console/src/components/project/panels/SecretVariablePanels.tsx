import React from 'react'
import {
  Stack,
  Text,
  Box,
  Group,
  Code,
  Button,
  Alert,
  Loader,
} from '@pikku/mantine/core'
import { KeyRound, Settings, Link, Unlink, AlertTriangle } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { SectionLabel } from './shared/SectionLabel'
import { SchemaSection } from './shared/SchemaSection'
import { SecretValueEditor } from './SecretValueEditor'
import { VariableValueEditor } from './VariableValueEditor'
import { usePikkuRPC } from '../../../context/PikkuRpcProvider'
import { useOptionalAuth } from '../../../context/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface SecretPanelProps {
  secretId: string
  metadata?: any
}

export const SecretConfiguration: React.FC<SecretPanelProps> = ({
  secretId,
  metadata = {},
}) => {
  useLocale()
  const isOAuth2 = !!metadata?.oauth2

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <KeyRound size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {asI18n(metadata?.displayName || secretId)}
          </Text>
        </Group>
        {metadata?.description && (
          <Text size="sm" c="dimmed" mt={4}>
            {asI18n(metadata.description)}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        {isOAuth2 ? (
          <PikkuBadge type="label" color="gray">
            {m.secret_config_oauth2()}
          </PikkuBadge>
        ) : (
          <PikkuBadge type="label" color="gray">
            {m.secret_config_secret()}
          </PikkuBadge>
        )}
      </Group>

      <Box>
        <SectionLabel>{m.secret_config_secret_id()}</SectionLabel>
        <Code>{metadata?.secretId}</Code>
      </Box>

      {isOAuth2 && (
        <>
          {metadata.oauth2.tokenSecretId && (
            <Box>
              <SectionLabel>{m.secret_config_token_secret_id()}</SectionLabel>
              <Code>{metadata.oauth2.tokenSecretId}</Code>
            </Box>
          )}
          {metadata.oauth2.authorizationUrl && (
            <Box>
              <SectionLabel>{m.secret_config_authorization_url()}</SectionLabel>
              <Text size="sm" ff="monospace">
                {asI18n(metadata.oauth2.authorizationUrl)}
              </Text>
            </Box>
          )}
          {metadata.oauth2.tokenUrl && (
            <Box>
              <SectionLabel>{m.secret_config_token_url()}</SectionLabel>
              <Text size="sm" ff="monospace">
                {asI18n(metadata.oauth2.tokenUrl)}
              </Text>
            </Box>
          )}
          {metadata.oauth2.scopes?.length > 0 && (
            <Box>
              <SectionLabel>{m.secret_config_scopes()}</SectionLabel>
              <Group gap={6}>
                {metadata.oauth2.scopes.map((scope: string) => (
                  <PikkuBadge key={scope} type="label" color="gray">
                    {asI18n(scope)}
                  </PikkuBadge>
                ))}
              </Group>
            </Box>
          )}
        </>
      )}

      <SchemaSection
        label={m.secret_config_fields()}
        schemaName={metadata?.schema}
      />

      {metadata?.installed !== false && (
        <>
          <SecretValueEditor
            secretId={metadata?.secretId}
            schemaName={metadata?.schema}
            isOAuth2={isOAuth2}
          />
          {isOAuth2 && (
            <OAuthConnectionSection credentialName={metadata.name} />
          )}
        </>
      )}
    </Stack>
  )
}

// A `type: 'singleton'` OAuth2 credential is the platform's, so its connection
// is managed here through the admin-gated /credential-oauth/link flow (which
// links it to the reserved platform user) and revoked through
// console:credentialDelete — the seam that can drop a platform-owned token.
// Per-user OAuth2 credentials are instead self-connected from the Credentials
// "Connections" tab, where the linking user's own session owns the account.
const OAuthConnectionSection: React.FC<{
  credentialName: string
}> = ({ credentialName }) => {
  useLocale()
  const rpc = usePikkuRPC()
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()

  const { data: connected, isLoading: statusLoading } = useQuery({
    queryKey: ['credential-status', credentialName],
    queryFn: async () => {
      const result = await rpc.invoke('console:credentialStatus', {
        names: [credentialName],
      })
      return result.statuses?.[credentialName] === true
    },
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await auth!.client.$fetch<{ url?: string }>(
        '/credential-oauth/link',
        {
          method: 'POST',
          body: {
            providerId: credentialName,
            callbackURL: window.location.href,
          },
        }
      )
      if (error) {
        throw new Error(error.message ?? m.oauth_connection_failed_to_connect())
      }
      if (!data?.url) {
        throw new Error(m.oauth_connection_failed_to_connect())
      }
      // Full-page redirect: the callback lands on better-auth's own origin,
      // which a popup cannot hand back to us.
      window.location.href = data.url
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await rpc.invoke('console:credentialDelete', { name: credentialName })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['credential-status', credentialName],
      })
    },
  })

  return (
    <Box>
      <SectionLabel>{m.oauth_connection_title()}</SectionLabel>
      <Stack gap="sm">
        {statusLoading ? (
          <Loader size="sm" />
        ) : connected ? (
          <PikkuBadge type="label" color="green">
            {m.oauth_connection_connected()}
          </PikkuBadge>
        ) : (
          <PikkuBadge type="label" color="gray">
            {m.oauth_connection_not_connected()}
          </PikkuBadge>
        )}

        {connectMutation.isError && (
          <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
            {m.oauth_connection_failed_to_connect()}
          </Alert>
        )}

        {disconnectMutation.isError && (
          <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
            {m.oauth_connection_failed_to_disconnect()}
          </Alert>
        )}

        <Group gap="xs">
          {!connected ? (
            <Button
              variant="light"
              color="green"
              size="sm"
              leftSection={<Link size={14} />}
              disabled={!auth?.user}
              loading={connectMutation.isPending}
              onClick={() => connectMutation.mutate()}
            >
              {m.oauth_connection_connect()}
            </Button>
          ) : (
            <Button
              variant="light"
              color="red"
              size="sm"
              leftSection={<Unlink size={14} />}
              loading={disconnectMutation.isPending}
              onClick={() => disconnectMutation.mutate()}
            >
              {m.oauth_connection_disconnect()}
            </Button>
          )}
        </Group>
      </Stack>
    </Box>
  )
}

interface VariablePanelProps {
  variableId: string
  metadata?: any
}

export const VariableConfiguration: React.FC<VariablePanelProps> = ({
  variableId,
  metadata = {},
}) => {
  useLocale()
  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Settings size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {asI18n(metadata?.displayName || variableId)}
          </Text>
        </Group>
        {metadata?.description && (
          <Text size="sm" c="dimmed" mt={4}>
            {asI18n(metadata.description)}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="label" color="teal">
          {m.variable_config_variable()}
        </PikkuBadge>
      </Group>

      <Box>
        <SectionLabel>{m.variable_config_variable_id()}</SectionLabel>
        <Code>{metadata?.variableId}</Code>
      </Box>

      <SchemaSection
        label={m.variable_config_fields()}
        schemaName={metadata?.schema}
      />

      {metadata?.installed !== false && (
        <VariableValueEditor
          variableId={metadata?.variableId}
          schemaName={metadata?.schema}
        />
      )}
    </Stack>
  )
}
