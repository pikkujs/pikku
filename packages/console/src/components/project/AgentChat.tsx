import React, { useState, useCallback, useMemo } from 'react'
import {
  Stack,
  Box,
  Text,
  Textarea,
  ActionIcon,
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
} from '@mantine/core'
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react'
import {
  usePikkuAgentRuntime,
  usePikkuAgentNonStreamingRuntime,
  PikkuApprovalContext,
  usePikkuApproval,
  resolvePikkuToolStatus,
  type PikkuToolStatus,
} from '@pikku/assistant-ui'
import {
  Send,
  ChevronDown,
  ChevronRight,
  Wrench,
  Bot,
  User,
  ShieldAlert,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { useAgentPlayground } from '@/context/AgentPlaygroundContext'
import { getServerUrl } from '@/context/PikkuRpcProvider'

const ToolCallDisplay: React.FunctionComponent<{
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  status: PikkuToolStatus
  argsText?: string
  addResult?: (result: unknown) => void
}> = ({ toolCallId, toolName, args, result, status, addResult }) => {
  const [opened, setOpened] = useState(false)
  const { handleApproval } = usePikkuApproval()
  const isApproval = status.type === 'requires-action'
  const approvalReason = (args as any)?.__approvalReason
  const displayArgs = { ...args }
  delete (displayArgs as any).__approvalReason
  const [responded, setResponded] = useState<'approved' | 'denied' | null>(null)

  const handleApprove = () => {
    setResponded('approved')
    handleApproval(toolCallId, true)
    addResult?.({ approved: true })
  }

  const handleDeny = () => {
    setResponded('denied')
    handleApproval(toolCallId, false)
    addResult?.({ approved: false })
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
            Approval required
          </Text>
        </Group>
        {approvalReason && (
          <Text size="xs" mb={4}>
            {approvalReason}
          </Text>
        )}
        <Text size="xs" c="dimmed" mb={4}>
          The agent wants to call <Code>{toolName}</Code>
        </Text>
        <Code block style={{ fontSize: 11, marginBottom: 8 }}>
          {JSON.stringify(displayArgs, null, 2)}
        </Code>
        <Group gap="xs">
          <Button
            size="xs"
            color="green"
            variant="light"
            onClick={handleApprove}
          >
            Approve
          </Button>
          <Button size="xs" color="red" variant="light" onClick={handleDeny}>
            Deny
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
            {toolName}
          </Text>
          <PikkuBadge
            type="label"
            color={responded === 'approved' ? 'green' : 'red'}
          >
            {responded}
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
            {toolName}
          </Text>
          {status.type === 'running' && <Loader size={10} />}
          {status.type === 'error' && (
            <PikkuBadge type="label" color="red">
              error
            </PikkuBadge>
          )}
          {status.type === 'denied' && (
            <PikkuBadge type="label" color="red">
              denied
            </PikkuBadge>
          )}
          {status.type === 'completed' && (
            <PikkuBadge type="label" color="green">
              done
            </PikkuBadge>
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Stack gap={4} mt="xs">
          <Text size="xs" c="dimmed">
            Arguments:
          </Text>
          <Code block style={{ fontSize: 11 }}>
            {JSON.stringify(displayArgs, null, 2)}
          </Code>
          {result !== undefined && (
            <>
              <Text size="xs" c="dimmed">
                Result:
              </Text>
              <Code block style={{ fontSize: 11 }}>
                {typeof result === 'string'
                  ? result
                  : JSON.stringify(result, null, 2)}
              </Code>
            </>
          )}
        </Stack>
      </Collapse>
    </Paper>
  )
}

const UserMessage: React.FunctionComponent = () => (
  <Box style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
    <Box maw="80%">
      <Group gap={6} mb={4}>
        <Text size="xs" c="dimmed">
          You
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
                {text}
              </Text>
            ),
          }}
        />
      </Paper>
    </Box>
  </Box>
)

const AssistantMessage: React.FunctionComponent = () => (
  <Box data-testid="assistant-block" style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
    <Box maw="80%">
      <Group gap={6} mb={4}>
        <Bot size={14} color="var(--mantine-color-dimmed)" />
        <Text size="xs" c="dimmed">
          Assistant
        </Text>
      </Group>
      <Paper
        p="sm"
        radius="md"
        bg="var(--mantine-color-default-hover)"
      >
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
                Thinking...
              </Text>
            </Group>
          </ThreadPrimitive.If>
        </MessagePrimitive.If>
      </Paper>
    </Box>
  </Box>
)

const AgentComposer: React.FunctionComponent<{ disabled?: boolean }> = ({
  disabled,
}) => (
  <Box py="sm" pb="md">
    <Container size="md">
      <ComposerPrimitive.Root>
        <Paper
          radius="md"
          withBorder
          style={{
            overflow: 'hidden',
            ...(disabled
              ? { opacity: 0.5, pointerEvents: 'none' as const }
              : {}),
          }}
        >
          <Group gap={0} align="flex-end" wrap="nowrap" px="lg" py={6}>
            <ComposerPrimitive.Input asChild>
              <Textarea
                placeholder={
                  disabled
                    ? 'Respond to approval request above...'
                    : 'Message...'
                }
                autosize
                minRows={2}
                maxRows={6}
                variant="unstyled"
                disabled={disabled}
                style={{ flex: 1 }}
                styles={{ input: { padding: '4px 0' } }}
              />
            </ComposerPrimitive.Input>
            <ComposerPrimitive.Send asChild>
              <ActionIcon
                variant="filled"
                size={28}
                radius="xl"
                mb={2}
                disabled={disabled}
              >
                <Send size={14} />
              </ActionIcon>
            </ComposerPrimitive.Send>
          </Group>
        </Paper>
      </ComposerPrimitive.Root>
    </Container>
  </Box>
)

export const AgentChat: React.FunctionComponent<{
  streaming?: boolean
}> = ({ streaming = false }) => {
  const { agentId, threadId, setThreadId, refetchThreads, dbMessages, model, temperature } =
    useAgentPlayground()

  const onStreamDone = useCallback(() => {
    refetchThreads()
  }, [refetchThreads])

  const serverUrl = getServerUrl()
  const api = `${serverUrl}/rpc/agent`

  const fallbackThreadId = useMemo(() => crypto.randomUUID(), [])
  const effectiveThreadId = threadId ?? fallbackThreadId

  const runtimeOptions = {
    api,
    agentName: agentId,
    threadId: effectiveThreadId,
    resourceId: 'default',
    initialMessages: dbMessages,
    onFinish: onStreamDone,
    model,
    temperature,
  }

  const streamingHook = usePikkuAgentRuntime(runtimeOptions)
  const nonStreamingHook = usePikkuAgentNonStreamingRuntime(runtimeOptions)

  const { runtime, isAwaitingApproval, pendingApprovals, handleApproval } =
    streaming ? streamingHook : nonStreamingHook

  return (
    <PikkuApprovalContext.Provider value={{ pendingApprovals, handleApproval }}>
    <AssistantRuntimeProvider runtime={runtime}>
      <Stack
        gap={0}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <ThreadPrimitive.Root style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
                            ? 'Send a message to start the conversation.'
                            : 'Start a new conversation.'}
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
