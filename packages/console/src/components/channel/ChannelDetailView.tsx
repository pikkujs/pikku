import React, { useMemo } from 'react'
import { Stack, Text, Group, Divider, Code } from '@mantine/core'
import type { ChannelMeta } from '@pikku/core/channel'
import { FunctionLink } from '@/components/project/panels/shared/FunctionLink'
import { SectionLabel } from '@/components/project/panels/shared/SectionLabel'
import { CommonDetails } from '@/components/project/panels/shared/CommonDetails'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { useChannelSnippets } from '@/hooks/useWirings'
import type { ChannelSelection } from './ChannelNavTree'

interface ChannelDetailViewProps {
  channelName: string
  channel: ChannelMeta
  selected: ChannelSelection
}

const getSnippet = (
  snippets:
    | {
        overview: string
        handlers: Record<string, string>
        actions: Record<string, Record<string, string>>
      }
    | undefined,
  selected: ChannelSelection
): string | null => {
  if (!snippets) return null
  if (!selected) return snippets.overview || null
  if (selected.type === 'handler')
    return snippets.handlers[selected.handler] || null
  return snippets.actions?.[selected.category]?.[selected.action] || null
}

const OverviewView: React.FunctionComponent<{
  channelName: string
  channel: ChannelMeta
}> = ({ channelName, channel }) => (
  <Stack gap="sm">
    <Text size="lg" fw={600}>
      {channelName}
    </Text>
    <PikkuBadge type="dynamic" badge="route" value={channel.route} />
    <CommonDetails
      description={channel.description}
      middleware={channel.middleware}
      permissions={channel.permissions}
      tags={channel.tags}
    />
  </Stack>
)

const HandlerView: React.FunctionComponent<{
  handler: string
  channel: ChannelMeta
}> = ({ handler, channel }) => {
  const meta = channel[handler as 'connect' | 'disconnect' | 'message']
  if (!meta) return null

  return (
    <Stack gap="sm">
      <Text size="lg" fw={600}>
        {handler}
      </Text>
      <Divider />
      <FunctionLink pikkuFuncId={meta.pikkuFuncId} />
      <CommonDetails
        middleware={meta.middleware}
        permissions={meta.permissions}
        tags={meta.tags}
      />
    </Stack>
  )
}

const ActionView: React.FunctionComponent<{
  category: string
  action: string
  channel: ChannelMeta
}> = ({ category, action, channel }) => {
  const actionMeta = channel.messageWirings?.[category]?.[action]
  if (!actionMeta) return null

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Text size="sm" c="dimmed">
          {category}
        </Text>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Text size="lg" fw={600}>
          {action}
        </Text>
      </Group>
      <Divider />
      <FunctionLink pikkuFuncId={actionMeta.pikkuFuncId} />
      <CommonDetails
        middleware={actionMeta.middleware}
        permissions={actionMeta.permissions}
        tags={actionMeta.tags}
      />
    </Stack>
  )
}

export const ChannelDetailView: React.FunctionComponent<
  ChannelDetailViewProps
> = ({ channelName, channel, selected }) => {
  const { data: snippets } = useChannelSnippets(channelName)
  const snippet = useMemo(
    () => getSnippet(snippets, selected),
    [snippets, selected]
  )

  return (
    <Stack gap="md" p="md" style={{ height: '100%', overflow: 'auto' }}>
      {!selected && (
        <OverviewView channelName={channelName} channel={channel} />
      )}
      {selected?.type === 'handler' && (
        <HandlerView handler={selected.handler} channel={channel} />
      )}
      {selected?.type === 'action' && (
        <ActionView
          category={selected.category}
          action={selected.action}
          channel={channel}
        />
      )}
      {snippet && (
        <>
          <Divider />
          <SectionLabel>Client Usage</SectionLabel>
          <Code block>{snippet}</Code>
        </>
      )}
    </Stack>
  )
}
