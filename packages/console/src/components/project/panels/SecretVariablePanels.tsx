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
} from '@mantine/core'
import {
  KeyRound,
  Settings,
  Link,
  Unlink,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
} from 'lucide-react'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { SectionLabel } from '@/components/project/panels/shared/SectionLabel'
import { SchemaSection } from '@/components/project/panels/shared/SchemaSection'
import { SecretValueEditor } from '@/components/project/panels/SecretValueEditor'
import { VariableValueEditor } from '@/components/project/panels/VariableValueEditor'
import {
  useOAuthStatus,
  useOAuthConnect,
  useOAuthDisconnect,
  useOAuthTestToken,
} from '@/hooks/useSecrets'
import { useQueryClient } from '@tanstack/react-query'

interface SecretPanelProps {
  secretId: string
  metadata?: any
}

export const SecretConfiguration: React.FunctionComponent<SecretPanelProps> = ({
  secretId,
  metadata = {},
}) => {
  const isOAuth2 = !!metadata?.oauth2

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <KeyRound size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.displayName || secretId}
          </Text>
        </Group>
        {metadata?.description && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.description}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        {isOAuth2 ? (
          <PikkuBadge type="label" color="violet">
            OAuth2
          </PikkuBadge>
        ) : (
          <PikkuBadge type="label" color="blue">
            Secret
          </PikkuBadge>
        )}
      </Group>

      <Box>
        <SectionLabel>Secret ID</SectionLabel>
        <Code>{metadata?.secretId}</Code>
      </Box>

      {isOAuth2 && (
        <>
          {metadata.oauth2.tokenSecretId && (
            <Box>
              <SectionLabel>Token Secret ID</SectionLabel>
              <Code>{metadata.oauth2.tokenSecretId}</Code>
            </Box>
          )}
          {metadata.oauth2.authorizationUrl && (
            <Box>
              <SectionLabel>Authorization URL</SectionLabel>
              <Text size="sm" ff="monospace">
                {metadata.oauth2.authorizationUrl}
              </Text>
            </Box>
          )}
          {metadata.oauth2.tokenUrl && (
            <Box>
              <SectionLabel>Token URL</SectionLabel>
              <Text size="sm" ff="monospace">
                {metadata.oauth2.tokenUrl}
              </Text>
            </Box>
          )}
          {metadata.oauth2.scopes?.length > 0 && (
            <Box>
              <SectionLabel>Scopes</SectionLabel>
              <Group gap={6}>
                {metadata.oauth2.scopes.map((scope: string) => (
                  <PikkuBadge key={scope} type="label" color="gray">
                    {scope}
                  </PikkuBadge>
                ))}
              </Group>
            </Box>
          )}
        </>
      )}

      <SchemaSection label="Fields" schemaName={metadata?.schema} />

      <SecretValueEditor
        secretId={metadata?.secretId}
        schemaName={metadata?.schema}
        isOAuth2={isOAuth2}
      />

      {isOAuth2 && <OAuthConnectionSection credentialName={metadata.name} />}
    </Stack>
  )
}

const OAuthConnectionSection: React.FunctionComponent<{
  credentialName: string
}> = ({ credentialName }) => {
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
      <SectionLabel>OAuth2 Connection</SectionLabel>
      <Stack gap="sm">
        {statusLoading ? (
          <Loader size="sm" />
        ) : status?.connected ? (
          <Stack gap="xs">
            <Group gap="xs">
              <PikkuBadge type="label" color="green">
                Connected
              </PikkuBadge>
              {status.hasRefreshToken && (
                <PikkuBadge type="label" color="gray">
                  Has Refresh Token
                </PikkuBadge>
              )}
            </Group>
            {status.expiresAt && (
              <Text size="xs" c="dimmed">
                {status.isExpired
                  ? `Token expired at ${new Date(status.expiresAt).toLocaleString()}`
                  : `Token expires at ${new Date(status.expiresAt).toLocaleString()}`}
              </Text>
            )}
          </Stack>
        ) : (
          <PikkuBadge type="label" color="gray">
            Not Connected
          </PikkuBadge>
        )}

        {connectMutation.isError && (
          <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
            Failed to start OAuth flow
          </Alert>
        )}

        {disconnectMutation.isError && (
          <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
            Failed to disconnect
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
            {(testTokenMutation.data as any)?.valid
              ? 'Token is valid'
              : `Token invalid: ${(testTokenMutation.data as any)?.error || 'unknown error'}`}
          </Alert>
        )}

        {testTokenMutation.isError && (
          <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
            Failed to test token
          </Alert>
        )}

        <Group gap="xs">
          {!status?.connected ? (
            <Button
              variant="light"
              color="green"
              size="xs"
              leftSection={<Link size={14} />}
              loading={connectMutation.isPending}
              onClick={handleConnect}
            >
              Connect
            </Button>
          ) : (
            <>
              <Button
                variant="light"
                color="blue"
                size="xs"
                leftSection={<ShieldCheck size={14} />}
                loading={testTokenMutation.isPending}
                onClick={handleTestToken}
              >
                Test Token
              </Button>
              <Button
                variant="light"
                color="red"
                size="xs"
                leftSection={<Unlink size={14} />}
                loading={disconnectMutation.isPending}
                onClick={handleDisconnect}
              >
                Disconnect
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

export const VariableConfiguration: React.FunctionComponent<
  VariablePanelProps
> = ({ variableId, metadata = {} }) => {
  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Settings size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.displayName || variableId}
          </Text>
        </Group>
        {metadata?.description && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.description}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="label" color="teal">
          Variable
        </PikkuBadge>
      </Group>

      <Box>
        <SectionLabel>Variable ID</SectionLabel>
        <Code>{metadata?.variableId}</Code>
      </Box>

      <SchemaSection label="Fields" schemaName={metadata?.schema} />

      <VariableValueEditor
        variableId={metadata?.variableId}
        schemaName={metadata?.schema}
      />
    </Stack>
  )
}
