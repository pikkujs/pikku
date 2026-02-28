import React, { useEffect, useRef, useState } from 'react'
import { Container, Stack, Text, Button, Alert, Loader } from '@mantine/core'
import { CheckCircle, AlertTriangle, X } from 'lucide-react'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export const OAuthCallbackPage: React.FunctionComponent = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  )
  const [errorMessage, setErrorMessage] = useState<string>('')
  const rpc = usePikkuRPC()
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    if (error) {
      setStatus('error')
      setErrorMessage(params.get('error_description') || error)
      return
    }

    if (!code || !state) {
      setStatus('error')
      setErrorMessage('Missing authorization code or state parameter')
      return
    }

    rpc.invoke('console:oauthExchangeTokens' as any, { code, state })
      .then(() => {
        setStatus('success')
        if (window.opener) {
          window.opener.postMessage(
            { type: 'oauth-callback-success' },
            window.location.origin
          )
        }
      })
      .catch(async (err: any) => {
        setStatus('error')
        if (err instanceof Response) {
          try {
            const body = await err.json()
            setErrorMessage(
              body?.message || body?.error || JSON.stringify(body)
            )
          } catch {
            setErrorMessage(`Server error (${err.status})`)
          }
        } else {
          setErrorMessage(
            err?.message || 'Failed to exchange authorization code'
          )
        }
      })
  }, [])

  return (
    <Container size="xs" py="xl">
      <Stack align="center" gap="lg">
        {status === 'loading' && (
          <>
            <Loader size="lg" />
            <Text size="lg">Completing authorization...</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={48} color="var(--mantine-color-green-6)" />
            <Text size="lg" fw={600}>
              Authorization Successful
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              You can close this window. The connection status will update
              automatically.
            </Text>
            <Button
              variant="light"
              leftSection={<X size={16} />}
              onClick={() => window.close()}
            >
              Close Window
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <Alert
              icon={<AlertTriangle size={16} />}
              color="red"
              variant="light"
              w="100%"
            >
              {errorMessage}
            </Alert>
            <Button
              variant="light"
              leftSection={<X size={16} />}
              onClick={() => window.close()}
            >
              Close Window
            </Button>
          </>
        )}
      </Stack>
    </Container>
  )
}
