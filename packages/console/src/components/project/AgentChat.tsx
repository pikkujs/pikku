import React, { useState, useCallback } from 'react'
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
} from '@mantine/core'
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react'
import {
  Send,
  ChevronDown,
  ChevronRight,
  Wrench,
  Bot,
  User,
  ShieldAlert,
} from 'lucide-react'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { useAgentPlayground } from '@/context/AgentPlaygroundContext'
import { useAgentRuntime } from '@/hooks/useAgentRuntime'

const ToolCallDisplay: React.FunctionComponent<{
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  status: { type: string }
  argsText?: string
  addResult?: (result: unknown) => void
}> = ({ toolName, args, result, status, addResult }) => {
  const [opened, setOpened] = useState(false)
  const isApproval = status.type === 'requires-action'
  const approvalReason = (args as any)?.__approvalReason
  const displayArgs = { ...args }
  delete (displayArgs as any).__approvalReason
  const [responded, setResponded] = useState<'approved' | 'denied' | null>(null)

  const handleApprove = () => {
    setResponded('approved')
    addResult?.({ approved: true })
  }

  const handleDeny = () => {
    setResponded('denied')
    addResult?.({ approved: false })
  }

  if (isApproval && !responded) {
    return (
      <Paper
        withBorder
        radius="sm"
        p="sm"
        my={4}
        bg="var(--mantine-color-yellow-0)"
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
          {status.type === 'complete' && (
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
        <User size={14} color="var(--mantine-color-blue-6)" />
      </Group>
      <Paper
        p="sm"
        radius="md"
        style={{ backgroundColor: 'var(--mantine-color-blue-light)' }}
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
  <Box style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
    <Box maw="80%">
      <Group gap={6} mb={4}>
        <Bot size={14} color="var(--mantine-color-violet-6)" />
        <Text size="xs" c="dimmed">
          Assistant
        </Text>
      </Group>
      <Paper
        p="sm"
        radius="md"
        style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}
      >
        <MessagePrimitive.Content
          components={{
            Text: ({ text }) => (
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {text}
              </Text>
            ),
            tools: {
              Fallback: (props) => (
                <ToolCallDisplay
                  toolName={props.toolName}
                  args={props.args as Record<string, unknown>}
                  result={props.result}
                  status={props.status}
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

const AgentComposer: React.FunctionComponent = () => (
  <Box py="sm" pb="md">
    <Container size="md">
      <ComposerPrimitive.Root>
        <Paper radius="md" withBorder style={{ overflow: 'hidden' }}>
          <Group gap={0} align="flex-end" wrap="nowrap" px="lg" py={6}>
            <ComposerPrimitive.Input asChild>
              <Textarea
                placeholder="Message..."
                autosize
                minRows={2}
                maxRows={6}
                variant="unstyled"
                style={{ flex: 1 }}
                styles={{ input: { padding: '4px 0' } }}
              />
            </ComposerPrimitive.Input>
            <ComposerPrimitive.Send asChild>
              <ActionIcon variant="filled" size={28} radius="xl" mb={2}>
                <Send size={14} />
              </ActionIcon>
            </ComposerPrimitive.Send>
          </Group>
        </Paper>
      </ComposerPrimitive.Root>
    </Container>
  </Box>
)

export const AgentChat: React.FunctionComponent = () => {
  const { agentId, threadId, setThreadId, refetchThreads, dbMessages } =
    useAgentPlayground()

  const onThreadCreated = useCallback(
    (id: string) => {
      setThreadId(id)
    },
    [setThreadId]
  )

  const onStreamDone = useCallback(() => {
    refetchThreads()
  }, [refetchThreads])

  const runtime = useAgentRuntime(
    agentId,
    threadId,
    dbMessages,
    onThreadCreated,
    onStreamDone
  )

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Stack
        gap={0}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <ThreadPrimitive.Root>
          <ThreadPrimitive.Viewport asChild>
            <ScrollArea style={{ flex: 1 }} type="auto">
              <Container size="md" p="md" pb="xl">
                <Stack gap="md">
                  <ThreadPrimitive.Empty>
                    <Center style={{ flex: 1, minHeight: 300 }}>
                      <Stack align="center" gap="xs">
                        <Bot size={40} color="var(--mantine-color-gray-5)" />
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
          <AgentComposer />
        </ThreadPrimitive.Root>
      </Stack>
    </AssistantRuntimeProvider>
  )
}
