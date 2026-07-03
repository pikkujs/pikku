import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Stack,
  Box,
  Text,
  ScrollArea,
  Paper,
  Group,
  Collapse,
  UnstyledButton,
  Loader,
  Center,
  Code,
  Container,
  Button,
  TypographyStylesProvider,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react'
import {
  usePikkuAgentRuntime,
  PikkuApprovalContext,
  usePikkuApproval,
  resolvePikkuToolStatus,
  type PikkuToolStatus,
  type MissingCredentialPayload,
} from '@pikku/assistant-ui'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Wrench,
  Bot,
  User,
  ShieldAlert,
} from 'lucide-react'
import { ComposerShell, composerStyles } from '../ui/ComposerShell'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PikkuBadge } from '../ui/PikkuBadge'
import { useAgentPlayground } from '../../context/AgentPlaygroundContext'
import { getServerUrl } from '../../context/serverUrl'
import {
  useOptionalImpersonation,
  IMPERSONATE_HEADER,
} from '../../context/ImpersonationContext'
import classes from '../ui/console.module.css'

const ToolCallDisplay: React.FC<{
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  status: PikkuToolStatus
  argsText?: string
  addResult?: (result: unknown) => void
}> = ({ toolCallId, toolName, args, result, status, addResult }) => {
  const [opened, setOpened] = useState(false)
  useLocale()
  const { handleApproval, pendingApprovals } = usePikkuApproval()

  const credentialPayload = (() => {
    if (!result) return null
    const r =
      typeof result === 'string'
        ? (() => {
            try {
              return JSON.parse(result)
            } catch {
              return null
            }
          })()
        : result
    return r && typeof r === 'object' && (r as any).__credentialRequired
      ? (r as {
          credentialName: string
          credentialType: 'oauth2' | 'apikey'
          connectUrl?: string
        })
      : null
  })()

  const pendingCredential = pendingApprovals.find(
    (p) => p.toolCallId === toolCallId && p.type === 'credential-request'
  )
  const isCredentialRequest = !!credentialPayload || !!pendingCredential
  const isApproval = status.type === 'requires-action' && !isCredentialRequest
  const approvalReason =
    (args as any)?.__approvalReason ??
    pendingApprovals.find(
      (a) => a.toolCallId === toolCallId && a.type !== 'credential-request'
    )?.reason
  const displayArgs = { ...args }
  delete (displayArgs as any).__approvalReason
  const [responded, setResponded] = useState<'approved' | 'denied' | null>(null)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const oauthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (oauthTimerRef.current) {
        clearInterval(oauthTimerRef.current)
        oauthTimerRef.current = null
      }
    }
  }, [])

  const handleApprove = async () => {
    setResponded('approved')
    if (await handleApproval(toolCallId, true)) {
      addResult?.({ approved: true })
    }
  }

  const handleDeny = async () => {
    setResponded('denied')
    if (await handleApproval(toolCallId, false)) {
      addResult?.({ approved: false })
    }
  }

  if (isApproval && !responded) {
    return (
      <Paper
        withBorder
        radius="sm"
        p="sm"
        my={4}
        bg="var(--mantine-color-yellow-light)"
      >
        <Group gap="xs" mb="xs">
          <ShieldAlert size={14} color="var(--mantine-color-orange-6)" />
          <Text size="xs" fw={600}>
            {m.agent_approval_required()}
          </Text>
        </Group>
        {approvalReason && (
          <Text size="xs" mb={4}>
            {asI18n(approvalReason)}
          </Text>
        )}
        <Box component="p" style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-dimmed)', margin: '0 0 4px' }}>
          {m.agent_approval_agent_wants_to_call()} <Code>{asI18n(toolName)}</Code>
        </Box>
        <Code block style={{ fontSize: 11, marginBottom: 8 }}>
          {asI18n(JSON.stringify(displayArgs, null, 2))}
        </Code>
        <Group gap="xs">
          <Button
            size="xs"
            color="green"
            variant="light"
            onClick={handleApprove}
          >
            {m.agent_approval_approve()}
          </Button>
          <Button size="xs" color="red" variant="light" onClick={handleDeny}>
            {m.agent_approval_deny()}
          </Button>
        </Group>
      </Paper>
    )
  }

  if (isApproval && responded) {
    return (
      <Paper withBorder radius="sm" p="sm" my={4}>
        <Group gap="xs" mb="xs">
          <ShieldAlert size={14} color="var(--mantine-color-orange-6)" />
          <Text size="xs" fw={600}>
            {asI18n(toolName)}
          </Text>
          <PikkuBadge
            type="label"
            color={responded === 'approved' ? 'green' : 'red'}
          >
            {responded === 'approved' ? m.agent_status_approved() : m.agent_status_denied()}
          </PikkuBadge>
        </Group>
      </Paper>
    )
  }

  if (isCredentialRequest && !responded) {
    const cred = credentialPayload ?? pendingCredential
    const serverUrl = getServerUrl()
    const rawConnectUrl = cred?.connectUrl
    const connectUrl = rawConnectUrl?.startsWith('/')
      ? `${serverUrl}${rawConnectUrl}`
      : rawConnectUrl

    const approveCredential = async () => {
      setResponded('approved')
      if (await handleApproval(toolCallId, true)) {
        addResult?.({ approved: true })
      }
    }

    const handleConnect = () => {
      if (cred?.credentialType === 'oauth2' && connectUrl) {
        const popup = window.open(
          connectUrl,
          'oauth-connect',
          'width=600,height=700'
        )
        // A blocked popup returns null — don't treat that as "connected", or
        // the run resumes with no credential and the tool fails again.
        if (!popup) {
          setPopupBlocked(true)
          return
        }
        oauthTimerRef.current = setInterval(() => {
          if (popup.closed) {
            clearInterval(oauthTimerRef.current!)
            oauthTimerRef.current = null
            void approveCredential()
          }
        }, 500)
      } else {
        void approveCredential()
      }
    }

    const handleIgnore = async () => {
      setResponded('denied')
      if (await handleApproval(toolCallId, false)) {
        addResult?.({ approved: false })
      }
    }

    return (
      <Paper
        withBorder
        radius="sm"
        p="sm"
        my={4}
        bg="var(--mantine-color-orange-light)"
      >
        <Group gap="xs" mb="xs">
          <Wrench size={14} color="var(--mantine-color-orange-6)" />
          <Text size="xs" fw={600}>
            {asI18n(toolName)}
          </Text>
          <PikkuBadge type="label" color="orange">
            {m.agent_credential_required()}
          </PikkuBadge>
        </Group>
        <Box component="p" style={{ fontSize: 'var(--mantine-font-size-sm)', margin: '0 0 var(--mantine-spacing-xs)' }}>
          {m.agent_credential_action_requires()}{' '}
          <strong>{asI18n(cred?.credentialName ?? 'OAuth')}</strong>{' '}
          {m.agent_credential_to_be_connected()}
        </Box>
        {popupBlocked && (
          <Text size="xs" c="red" mb="xs">
            {asI18n(
              'Popup blocked — allow popups for this site, then click Connect again.'
            )}
          </Text>
        )}
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={handleConnect}>
            {asI18n(`Connect ${cred?.credentialName ?? 'OAuth'}`)}
          </Button>
          <Button size="xs" color="gray" variant="light" onClick={handleIgnore}>
            {m.agent_credential_ignore()}
          </Button>
        </Group>
      </Paper>
    )
  }

  if (isCredentialRequest && responded) {
    return (
      <Paper withBorder radius="sm" p="sm" my={4}>
        <Group gap="xs">
          <Wrench size={14} color="var(--mantine-color-orange-6)" />
          <Text size="xs" fw={600}>
            {asI18n(toolName)}
          </Text>
          <PikkuBadge
            type="label"
            color={responded === 'approved' ? 'green' : 'gray'}
          >
            {responded === 'approved' ? m.agent_credential_connected() : m.agent_credential_ignored()}
          </PikkuBadge>
        </Group>
      </Paper>
    )
  }

  return (
    <Paper withBorder radius="sm" p="xs" my={4}>
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: '100%' }}
      >
        <Group gap="xs">
          {opened ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Wrench size={12} />
          <Text size="xs" fw={500} ff="monospace">
            {asI18n(toolName)}
          </Text>
          {status.type === 'running' && <Loader size={10} />}
          {status.type === 'error' && (
            <PikkuBadge type="label" color="red">
              {m.agent_toolcall_error()}
            </PikkuBadge>
          )}
          {status.type === 'denied' && (
            <PikkuBadge type="label" color="red">
              {m.agent_toolcall_denied()}
            </PikkuBadge>
          )}
          {status.type === 'completed' && (
            <PikkuBadge type="label" color="green">
              {m.agent_toolcall_done()}
            </PikkuBadge>
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Stack gap={4} mt="xs">
          <Text size="xs" c="dimmed">
            {m.agent_toolcall_arguments()}
          </Text>
          <Code block style={{ fontSize: 11 }}>
            {asI18n(JSON.stringify(displayArgs, null, 2))}
          </Code>
          {result !== undefined && (
            <>
              <Text size="xs" c="dimmed">
                {m.agent_toolcall_result()}
              </Text>
              <Code block style={{ fontSize: 11 }}>
                {asI18n(typeof result === 'string'
                  ? result
                  : JSON.stringify(result, null, 2))}
              </Code>
            </>
          )}
        </Stack>
      </Collapse>
    </Paper>
  )
}

const UserMessage: React.FC = () => {
  useLocale()
  return (
    <Box className={classes.chatMessageRight}>
      <Box maw="80%">
        <Group gap={6} mb={4}>
          <Text size="xs" c="dimmed">
            {m.agent_message_you()}
          </Text>
          <User size={14} color="var(--mantine-color-dimmed)" />
        </Group>
        <Paper
          p="sm"
          radius="md"
          style={{ backgroundColor: 'var(--mantine-color-default-hover)' }}
        >
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {asI18n(text)}
                </Text>
              ),
            }}
          />
        </Paper>
      </Box>
    </Box>
  )
}

const AssistantMessage: React.FC = () => {
  useLocale()
  return (
    <Box data-testid="assistant-block" className={classes.chatMessageLeft}>
      <Box maw="80%">
        <Group gap={6} mb={4}>
          <Bot size={14} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            {m.agent_message_assistant()}
          </Text>
        </Group>
        <Paper p="sm" radius="md" bg="var(--mantine-color-default-hover)">
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => (
                <TypographyStylesProvider p={0} m={0} fz="sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {text}
                  </ReactMarkdown>
                </TypographyStylesProvider>
              ),
              tools: {
                Fallback: (props) => (
                  <ToolCallDisplay
                    toolCallId={props.toolCallId}
                    toolName={props.toolName}
                    args={props.args as Record<string, unknown>}
                    result={props.result}
                    status={resolvePikkuToolStatus(props.status, props.result)}
                    argsText={props.argsText}
                    addResult={props.addResult}
                  />
                ),
              },
            }}
          />
          <MessagePrimitive.If last>
            <ThreadPrimitive.If running>
              <Group gap="xs" mt="xs">
                <Loader size={12} />
                <Text size="sm" c="dimmed">
                  {m.agent_message_thinking()}
                </Text>
              </Group>
            </ThreadPrimitive.If>
          </MessagePrimitive.If>
        </Paper>
      </Box>
    </Box>
  )
}

const AgentComposer: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  useLocale()
  return (
    <Box py="sm" pb="md">
      <Container size="md">
        <ComposerShell
          component={ComposerPrimitive.Root}
          input={
            <ComposerPrimitive.Input
              className={composerStyles.composerInput}
              placeholder={
                disabled ? m.agent_composer_approval_placeholder() : m.agent_composer_message_placeholder()
              }
              rows={1}
              disabled={disabled ?? false}
            />
          }
          send={
            <ComposerPrimitive.Send
              className={composerStyles.sendButton}
              disabled={disabled ?? false}
            >
              <ArrowUp size={15} />
            </ComposerPrimitive.Send>
          }
        />
      </Container>
    </Box>
  )
}

export const AgentChat: React.FC = () => {
  useLocale()
  const { agentId, threadId, refetchThreads, model, temperature } =
    useAgentPlayground()

  const onStreamDone = useCallback(() => {
    refetchThreads()
  }, [refetchThreads])

  const serverUrl = getServerUrl()
  const api = `${serverUrl}/rpc/agent`

  const impersonation = useOptionalImpersonation()
  const headers = useMemo(
    () =>
      impersonation?.target
        ? { [IMPERSONATE_HEADER]: impersonation.target.id }
        : undefined,
    [impersonation?.target]
  )

  const fallbackThreadId = useMemo(() => crypto.randomUUID(), [])
  const effectiveThreadId = threadId ?? fallbackThreadId

  const runtimeOptions = {
    api,
    agentName: agentId,
    threadId: effectiveThreadId,
    resourceId: 'default',
    onFinish: onStreamDone,
    model,
    temperature,
    headers,
    credentials: 'include' as RequestCredentials,
  }

  const { runtime, isAwaitingApproval, pendingApprovals, handleApproval } =
    usePikkuAgentRuntime(runtimeOptions)

  return (
    <PikkuApprovalContext.Provider value={{ pendingApprovals, handleApproval }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <Stack gap={0} className={classes.flexColumn}>
          <ThreadPrimitive.Root
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            <ThreadPrimitive.Viewport asChild>
              <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
                <Container size="md" p="md" pb="xl">
                  <Stack gap="md">
                    <ThreadPrimitive.Empty>
                      <Center style={{ flex: 1, minHeight: 300 }}>
                        <Stack align="center" gap="xs">
                          <Bot
                            size={40}
                            color="var(--mantine-color-default-border)"
                          />
                          <Text c="dimmed" ta="center">
                            {threadId
                              ? m.agent_empty_send_message()
                              : m.agent_empty_start_conversation()}
                          </Text>
                        </Stack>
                      </Center>
                    </ThreadPrimitive.Empty>
                    <ThreadPrimitive.Messages
                      components={{
                        UserMessage,
                        AssistantMessage,
                      }}
                    />
                  </Stack>
                </Container>
              </ScrollArea>
            </ThreadPrimitive.Viewport>
            <AgentComposer disabled={isAwaitingApproval} />
          </ThreadPrimitive.Root>
        </Stack>
      </AssistantRuntimeProvider>
    </PikkuApprovalContext.Provider>
  )
}
