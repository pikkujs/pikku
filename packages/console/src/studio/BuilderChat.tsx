import React, { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionIcon, Box, Button, Center, Container, Group, Loader, ScrollArea, Stack, Text } from '@pikku/mantine/core'
import { ArrowUp, Check, Crosshair, Hammer, Milestone, Square, TriangleAlert, X } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { ComposerShell, composerStyles } from '../components/ui/ComposerShell'
import { Markdown } from '../components/ui/Markdown'
import { clearChatRefs, removeChatRef, useChatRefs, withChatRefs } from './chatRefs'
import { studioCall, useStudioAction } from './studio'

type BuilderItem =
  | { kind: 'user'; text: string; at: number }
  | { kind: 'assistant'; text: string; at: number }
  | { kind: 'tool'; id: string; name: string; summary: string; status: 'running' | 'done' | 'error'; at: number }
  | { kind: 'error'; text: string; at: number }
  | { kind: 'loop'; text: string; at: number }

export interface BuilderState {
  busy: boolean
  items: BuilderItem[]
}

export const useBuilderState = (key: string) =>
  useQuery({
    queryKey: ['studio', 'builder', key],
    queryFn: () => studioCall<BuilderState>('builderState', { key }),
    refetchInterval: (query) => (query.state.data?.busy ? 700 : false),
  })

const ToolRow: React.FC<{ item: Extract<BuilderItem, { kind: 'tool' }> }> = ({ item }) => (
  <Group gap="xs" wrap="nowrap" data-testid="builder-tool">
    {item.status === 'running' ? (
      <Loader size={12} />
    ) : item.status === 'error' ? (
      <TriangleAlert size={13} color="var(--mantine-color-red-6)" />
    ) : (
      <Check size={13} color="var(--mantine-color-dimmed)" />
    )}
    <Text size="xs" fw={600} c="dimmed" style={{ flexShrink: 0 }}>
      {asI18n(item.name)}
    </Text>
    <Text size="xs" c="dimmed" ff="monospace" truncate>
      {asI18n(item.summary)}
    </Text>
  </Group>
)

const Item: React.FC<{ item: BuilderItem }> = ({ item }) => {
  if (item.kind === 'tool') return <ToolRow item={item} />
  if (item.kind === 'loop')
    return (
      <Group gap="xs" wrap="nowrap" data-testid="builder-loop" style={{ borderTop: '1px solid var(--mantine-color-default-border)', paddingTop: 8 }}>
        <Milestone size={14} color="var(--mantine-primary-color-filled)" style={{ flexShrink: 0 }} />
        <Text size="sm" fw={600}>
          {asI18n(item.text)}
        </Text>
      </Group>
    )
  if (item.kind === 'error')
    return (
      <Text size="sm" c="red" style={{ whiteSpace: 'pre-wrap' }} data-testid="builder-error">
        {asI18n(item.text)}
      </Text>
    )
  if (item.kind === 'user')
    return (
      <Box
        data-testid="builder-user"
        style={{
          alignSelf: 'flex-end',
          maxWidth: '80%',
          background: 'var(--mantine-color-default-hover)',
          borderRadius: 12,
          padding: '8px 12px',
        }}
      >
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {asI18n(item.text)}
        </Text>
      </Box>
    )
  return (
    <Box data-testid="builder-assistant">
      <Markdown>{asI18n(item.text)}</Markdown>
    </Box>
  )
}

const Thread: React.FC<{ state: BuilderState }> = ({ state }) => {
  const end = useRef<HTMLDivElement>(null)
  const last = state.items.at(-1)
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [state.items.length, last && 'text' in last ? last.text : null])
  if (state.items.length === 0)
    return (
      <Center style={{ minHeight: 320 }}>
        <Stack align="center" gap="xs" maw={420}>
          <Hammer size={36} color="var(--mantine-color-default-border)" />
          <Text fw={600}>{m.studio_builder_empty_title()}</Text>
          <Text size="sm" c="dimmed" ta="center">
            {m.studio_builder_empty_body()}
          </Text>
        </Stack>
      </Center>
    )
  return (
    <Stack gap="md">
      {state.items.map((item, i) => (
        <Item key={i} item={item} />
      ))}
      {state.busy && last?.kind !== 'tool' && (
        <Group gap="xs">
          <Loader size={12} />
          <Text size="sm" c="dimmed">
            {m.studio_builder_working()}
          </Text>
        </Group>
      )}
      <div ref={end} />
    </Stack>
  )
}

const Composer: React.FC<{ projectKey: string; busy: boolean; context?: string }> = ({ projectKey, busy, context }) => {
  const [text, setText] = useState('')
  const client = useQueryClient()
  const prompt = useStudioAction<{ key: string; message: string; context?: string }, BuilderState>('builderPrompt')
  const cancel = useStudioAction<{ key: string }, BuilderState>('builderCancel')
  const picked = useChatRefs()
  const send = () => {
    if (!text.trim()) return
    prompt.mutate(
      { key: projectKey, message: withChatRefs(text.trim(), picked), context },
      {
        onSuccess: (state) => {
          client.setQueryData(['studio', 'builder', projectKey], state)
          setText('')
          clearChatRefs()
        },
      }
    )
  }
  return (
    <Box py="sm" pb="md">
      <Container size="md">
        {prompt.error && (
          <Text size="sm" c="red" mb="xs">
            {asI18n(prompt.error.message)}
          </Text>
        )}
        {picked.length > 0 && (
          <Group gap={6} mb={6} data-testid="builder-chat-refs">
            {picked.map((ref) => (
              <Group
                key={ref.id}
                gap={4}
                px={8}
                py={2}
                wrap="nowrap"
                title={ref.title}
                style={{ border: '1px solid var(--app-border)', borderRadius: 999, fontSize: 12, maxWidth: '100%' }}
                data-testid="builder-chat-ref"
              >
                <Crosshair size={11} />
                <Text size="xs" truncate>
                  {asI18n(ref.label)}
                </Text>
                <ActionIcon size={16} variant="subtle" color="gray" aria-label={m.builder_chat_clear_element_aria()} onClick={() => removeChatRef(ref.id)}>
                  <X size={10} />
                </ActionIcon>
              </Group>
            ))}
          </Group>
        )}
        <ComposerShell
          input={
            <textarea
              className={composerStyles.composerInput}
              data-testid="builder-composer"
              placeholder={busy ? m.studio_builder_follow_up() : m.studio_builder_placeholder()}
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
            />
          }
          controls={
            busy ? (
              <Button
                size="xs"
                variant="default"
                leftSection={<Square size={12} />}
                loading={cancel.isPending}
                onClick={() => cancel.mutate({ key: projectKey })}
                data-testid="builder-stop"
              >
                {m.studio_builder_stop()}
              </Button>
            ) : null
          }
          send={
            <button
              type="button"
              className={composerStyles.sendButton}
              disabled={!text.trim() || prompt.isPending}
              onClick={send}
              data-testid="builder-send"
            >
              <ArrowUp size={15} />
            </button>
          }
        />
      </Container>
    </Box>
  )
}

export const BuilderChat: React.FC<{ projectKey: string; context?: string }> = ({ projectKey, context }) => {
  const state = useBuilderState(projectKey)
  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
        <Container size="md" p="md" pb="xl">
          {state.isLoading ? <Loader size="sm" /> : state.data && <Thread state={state.data} />}
        </Container>
      </ScrollArea>
      <Composer projectKey={projectKey} busy={state.data?.busy ?? false} context={context} />
    </Stack>
  )
}
