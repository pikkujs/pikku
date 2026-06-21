import React, { useCallback, useRef } from 'react'
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
import {
  KeyRound,
  Settings,
  Link,
  Unlink,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
} from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { SectionLabel } from './shared/SectionLabel'
import { SchemaSection } from './shared/SchemaSection'
import { SecretValueEditor } from './SecretValueEditor'
import { VariableValueEditor } from './VariableValueEditor'
import {
  useOAuthStatus,
  useOAuthConnect,
  useOAuthDisconnect,
  useOAuthTestToken,
} from '../../../hooks/useSecrets'
import { useQueryClient } from '@tanstack/react-query'

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

      <SchemaSection label={m.secret_config_fields()} schemaName={metadata?.schema} />

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

const OAuthConnectionSection: React.FC<{
  credentialName: string
}> = ({ credentialName }) => {
  useLocale()
  const queryClient = useQueryClient()
  const popupRef = useRef<Window | null>(null)
  const { data: status, isLoading: statusLoading } = useOAuthStatus(
    credentialName,
    true
  )
  const connectMutation = useOAuthConnect()
  const disconnectMutation = useOAuthDisconnect()
  const testTokenMutation = useOAuthTestToken()

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === 'oauth-callback-success') {
        queryClient.invalidateQueries({
          queryKey: ['oauth-status', credentialName],
        })
        window.removeEventListener('message', handleMessage)
      }
    },
    [credentialName, queryClient]
  )

  const handleConnect = useCallback(() => {
    const callbackUrl = `${window.location.origin}/oauth/callback`
    connectMutation.mutate(
      { credentialName, callbackUrl },
      {
        onSuccess: (data) => {
          window.addEventListener('message', handleMessage)
          popupRef.current = window.open(
            (data as any).authUrl,
            'oauth-popup',
            'width=600,height=700,popup=yes'
          )
        },
      }
    )
  }, [credentialName, connectMutation, handleMessage])

  const handleDisconnect = useCallback(() => {
    disconnectMutation.mutate({ credentialName })
  }, [credentialName, disconnectMutation])

  const handleTestToken = useCallback(() => {
    testTokenMutation.mutate({ credentialName })
  }, [credentialName, testTokenMutation])

  return (
    <Box>
      <SectionLabel>{m.oauth_connection_title()}</SectionLabel>
      <Stack gap="sm">
        {statusLoading ? (
          <Loader size="sm" />
        ) : status?.connected ? (
          <Stack gap="xs">
            <Group gap="xs">
              <PikkuBadge type="label" color="green">
                {m.oauth_connection_connected()}
              </PikkuBadge>
              {status.hasRefreshToken && (
                <PikkuBadge type="label" color="gray">
                  {m.oauth_connection_has_refresh_token()}
                </PikkuBadge>
              )}
            </Group>
            {status.expiresAt && (
              <Text size="sm" c="dimmed">
                {asI18n(
                  status.isExpired
                    ? `Token expired at ${new Date(status.expiresAt).toLocaleString()}`
                    : `Token expires at ${new Date(status.expiresAt).toLocaleString()}`
                )}
              </Text>
            )}
          </Stack>
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

        {testTokenMutation.isSuccess && (
          <Alert
            icon={
              (testTokenMutation.data as any)?.valid ? (
                <CheckCircle size={16} />
              ) : (
                <AlertTriangle size={16} />
              )
            }
            color={(testTokenMutation.data as any)?.valid ? 'green' : 'red'}
            variant="light"
          >
            {asI18n(
              (testTokenMutation.data as any)?.valid
                ? 'Token is valid'
                : `Token invalid: ${(testTokenMutation.data as any)?.error || 'unknown error'}`
            )}
          </Alert>
        )}

        {testTokenMutation.isError && (
          <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
            {m.oauth_connection_failed_to_test_token()}
          </Alert>
        )}

        <Group gap="xs">
          {!status?.connected ? (
            <Button
              variant="light"
              color="green"
              size="sm"
              leftSection={<Link size={14} />}
              loading={connectMutation.isPending}
              onClick={handleConnect}
            >
              {m.oauth_connection_connect()}
            </Button>
          ) : (
            <>
              <Button
                variant="default"
                size="sm"
                leftSection={<ShieldCheck size={14} />}
                loading={testTokenMutation.isPending}
                onClick={handleTestToken}
              >
                {m.oauth_connection_test_token()}
              </Button>
              <Button
                variant="light"
                color="red"
                size="sm"
                leftSection={<Unlink size={14} />}
                loading={disconnectMutation.isPending}
                onClick={handleDisconnect}
              >
                {m.oauth_connection_disconnect()}
              </Button>
            </>
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

      <SchemaSection label={m.variable_config_fields()} schemaName={metadata?.schema} />

      {metadata?.installed !== false && (
        <VariableValueEditor
          variableId={metadata?.variableId}
          schemaName={metadata?.schema}
        />
      )}
    </Stack>
  )
}
