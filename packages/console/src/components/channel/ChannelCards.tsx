import React, { useEffect, useMemo, useRef } from 'react'
import { ActionIcon, Box, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import {
  ChevronRight,
  Globe,
  Lock,
  LogIn,
  LogOut,
  MessageSquare,
  MessagesSquare,
} from 'lucide-react'
import type { ChannelMeta, ChannelMessageMeta } from '@pikku/core/channel'
import { m } from '@/i18n/messages'
import { useFunctionsMeta, useChannelSnippets } from '../../hooks/useWirings'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevCode, DevField, DevFields, devSourcePath } from '../ui/DevDetail'
import { formatChannelRoute, type ChannelSelection } from './channel-selection'

type Snippets = {
  overview: string
  handlers: Record<string, string>
  actions: Record<string, Record<string, string>>
}

type HandlerKey = 'connect' | 'disconnect' | 'message'

const HANDLERS: {
  key: HandlerKey
  Icon: typeof LogIn
  title: () => I18nNode
  meta: () => I18nNode
}[] = [
  {
    key: 'connect',
    Icon: LogIn,
    title: () => m.wires_channels_connect_title(),
    meta: () => m.wires_channels_connect_meta(),
  },
  {
    key: 'disconnect',
    Icon: LogOut,
    title: () => m.wires_channels_disconnect_title(),
    meta: () => m.wires_channels_disconnect_meta(),
  },
  {
    key: 'message',
    Icon: MessageSquare,
    title: () => m.wires_channels_message_title(),
    meta: () => m.wires_channels_message_meta(),
  },
]

const humanize = (value: string) => {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_:]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const connectSnippet = (channel: ChannelMeta) =>
  [
    `const ws = new WebSocket(\`wss://\${location.host}${channel.route || '/'}\`)`,
    ``,
    `ws.onmessage = (event) => {`,
    `  console.log(JSON.parse(event.data))`,
    `}`,
  ].join('\n')

const actionSnippet = (category: string, action: string) =>
  [
    `ws.send(JSON.stringify({`,
    `  ${category}: '${action}',`,
    `}))`,
  ].join('\n')

export const channelMatches = (
  name: string,
  channel: ChannelMeta,
  query: string
) => {
  if (!query) return true
  const needle = query.toLowerCase()
  const actions = Object.values(channel.messageWirings ?? {}).flatMap(
    (group) => Object.keys(group)
  )
  return [name, channel.route, channel.summary, channel.description, ...actions]
    .filter(Boolean)
    .some((text) => text!.toLowerCase().includes(needle))
}

export const channelRows = (name: string, channel: ChannelMeta) => [
  ...Object.entries(channel.messageWirings ?? {}).flatMap(([category, group]) =>
    Object.keys(group).map(
      (action): ChannelSelection => ({ type: 'action', category, action })
    )
  ),
  ...HANDLERS.filter((entry) => channel[entry.key]).map(
    (entry): ChannelSelection => ({ type: 'handler', handler: entry.key })
  ),
]

const handlerOf = (channel: ChannelMeta, selected: ChannelSelection) =>
  selected?.type === 'action'
    ? channel.messageWirings?.[selected.category]?.[selected.action]
    : selected?.type === 'handler'
      ? channel[selected.handler as HandlerKey]
      : undefined

export const channelRowTitle = (
  channel: ChannelMeta,
  selected: ChannelSelection
): string => {
  const handler = handlerOf(channel, selected)
  if (selected?.type === 'action') {
    return handler?.summary || handler?.description || humanize(selected.action)
  }
  return humanize(selected?.type === 'handler' ? selected.handler : '')
}

export const ChannelMessageDetail: React.FC<{
  channelName: string
  selected: ChannelSelection
}> = ({ channelName, selected }) => {
  const { meta } = usePikkuMeta()
  const { data: functions } = useFunctionsMeta()
  const { data } = useChannelSnippets(channelName)
  const snippets = data as Snippets | undefined
  const channel = meta.channelsMeta?.[channelName] as ChannelMeta | undefined
  const handler = channel ? handlerOf(channel, selected) : undefined
  if (!handler || !selected) return null

  const routing =
    selected.type === 'action'
      ? { category: selected.category, action: selected.action }
      : undefined
  const snippet =
    selected.type === 'action'
      ? snippets?.actions?.[selected.category]?.[selected.action]
      : snippets?.handlers?.[selected.handler]
  const funcMeta = (functions as any[] | undefined)?.find(
    (f) => f.name === handler.pikkuFuncId
  )
  const text = handler.summary || handler.description
  const standard = HANDLERS.find(
    (entry) => selected.type === 'handler' && entry.key === selected.handler
  )
  const testId = `channel-detail-${channelName}-${formatChannelRoute({ channelName: '', selected }) || (selected.type === 'handler' ? selected.handler : '')}`

  return (
    <Stack gap="md" data-testid={testId}>
      {selected.type === 'action' && (
        <Text size="sm" c="dimmed">
          {m.wires_channels_action_meta({ action: selected.action })}
        </Text>
      )}
      {standard && (
        <Text size="sm" c="dimmed">
          {text ? asI18n(text) : standard.meta()}
        </Text>
      )}
      {handler.summary && handler.description && (
        <Text size="sm" c="dimmed" maw={640}>
          {asI18n(handler.description)}
        </Text>
      )}
      {routing && (
        <DevCode
          code={actionSnippet(routing.category, routing.action)}
          language="typescript"
          label={m.wires_channels_how_to_send()}
        />
      )}
      <ForDevelopers testId={`${testId}-dev`}>
        <DevFields>
          <DevField label={m.dev_function()} value={handler.pikkuFuncId} />
          {routing && (
            <DevField
              label={m.wires_channels_dev_routing()}
              value={`${routing.category}: "${routing.action}"`}
            />
          )}
          {funcMeta?.sourceFile && (
            <DevField
              label={m.dev_source()}
              value={devSourcePath(funcMeta.sourceFile)}
            />
          )}
          {handler.packageName && (
            <DevField label={m.dev_package()} value={handler.packageName} />
          )}
          {funcMeta?.inputSchemaName && (
            <DevField
              label={m.wires_channels_dev_input()}
              value={funcMeta.inputSchemaName}
            />
          )}
          {funcMeta?.outputSchemaName && (
            <DevField
              label={m.wires_channels_dev_output()}
              value={funcMeta.outputSchemaName}
            />
          )}
        </DevFields>
        {funcMeta?.inputSchemaName && (
          <SchemaSection
            label={m.wires_channels_dev_input()}
            schemaName={funcMeta.inputSchemaName}
          />
        )}
        {snippet && (
          <DevCode
            code={snippet}
            language="typescript"
            label={m.wires_channels_dev_client()}
          />
        )}
      </ForDevelopers>
    </Stack>
  )
}

const HandlerRow: React.FC<{
  testId: string
  Icon: typeof LogIn
  title: I18nNode
  meta: I18nNode
  selected: boolean
  onOpen: () => void
}> = ({ testId, Icon, title, meta, selected, onOpen }) => (
  <CardRow
    testId={testId}
    onClick={onOpen}
    selected={selected}
    leading={
      <StatusTile tone="info">
        <Icon size={18} />
      </StatusTile>
    }
    title={title}
    meta={meta}
    trailing={
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label={m.wires_channels_row_show()}
        onClick={onOpen}
      >
        <ChevronRight size={16} />
      </ActionIcon>
    }
  />
)

const channelActions = (channel: ChannelMeta) =>
  Object.entries(channel.messageWirings ?? {}).flatMap(([category, group]) =>
    Object.entries(group).map(([action, handler]) => ({
      category,
      action,
      handler,
    }))
  )

export const channelMessageCount = (channel: ChannelMeta) =>
  channelActions(channel).length + (channel.message ? 1 : 0)

export const channelCountLabel = (count: number): I18nNode =>
  count === 0
    ? m.wires_channels_count_none()
    : count === 1
      ? m.wires_channels_count_one()
      : m.wires_channels_count({ count })

export const channelLabel = (name: string, channel: ChannelMeta): I18nNode =>
  asI18n(channel.summary || humanize(name))

const ChannelCard: React.FC<{
  name: string
  channel: ChannelMeta
  focused: boolean
  isOpen: (selected: ChannelSelection) => boolean
  onOpen: (selected: ChannelSelection) => void
}> = ({ name, channel, focused, isOpen, onOpen }) => {
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useChannelSnippets(name)
  const snippets = data as Snippets | undefined
  const focusedOnArrival = useRef(focused)

  useEffect(() => {
    if (focusedOnArrival.current)
      ref.current?.scrollIntoView({ block: 'start' })
  }, [])

  const actions = channelActions(channel)
  const handlers = HANDLERS.filter((entry) => channel[entry.key])
  const messageCount = channelMessageCount(channel)
  const publicChannel = channel.auth === false
  const categories = Object.keys(channel.messageWirings ?? {})

  return (
    <Box ref={ref}>
      <SectionCard
        testId={`channel-card-${name}`}
        eyebrow={
          <Text size="sm" c="dimmed" mb={4}>
            {m.wires_channels_eyebrow()}
          </Text>
        }
        title={channelLabel(name, channel)}
        subtitle={channelCountLabel(messageCount)}
        badges={
          publicChannel ? (
            <StatusBadge tone="warn" size="sm">
              {m.wires_channels_badge_public()}
            </StatusBadge>
          ) : (
            <StatusBadge tone="good" size="sm">
              {m.wires_channels_badge_signed_in()}
            </StatusBadge>
          )
        }
        blurb={
          channel.description
            ? asI18n(channel.description)
            : m.wires_channels_blurb()
        }
        footer={
          <ForDevelopers
            attached
            hint={m.wires_channels_dev_hint()}
            testId={`channel-dev-${name}`}
          >
            <DevFields>
              <DevField label={m.dev_id()} value={name} />
              <DevField label={m.wires_channels_dev_path()} value={channel.route || '/'} />
              {categories.length > 0 && (
                <DevField
                  label={m.wires_channels_dev_keys()}
                  value={categories.join(', ')}
                />
              )}
              {(channel.params?.length ?? 0) > 0 && (
                <DevField
                  label={m.wires_channels_dev_params()}
                  value={channel.params!.join(', ')}
                />
              )}
              {(channel.query?.length ?? 0) > 0 && (
                <DevField
                  label={m.wires_channels_dev_query()}
                  value={channel.query!.join(', ')}
                />
              )}
              <DevField
                label={m.wires_channels_dev_auth()}
                value={publicChannel ? 'auth: false' : 'auth: true'}
                copy={false}
              />
              {(channel.tags?.length ?? 0) > 0 && (
                <DevField label={m.dev_tags()} value={channel.tags!.join(' ')} />
              )}
            </DevFields>
            <DevCode
              code={connectSnippet(channel)}
              language="typescript"
              label={m.wires_channels_dev_connect()}
            />
            {snippets?.overview && (
              <DevCode
                code={snippets.overview}
                language="typescript"
                label={m.wires_channels_dev_client()}
              />
            )}
          </ForDevelopers>
        }
      >
        <Stack gap="xs" mt="md">
          <CardRow
            testId={`channel-access-${name}`}
            leading={
              <StatusTile tone={publicChannel ? 'warn' : 'good'}>
                {publicChannel ? <Globe size={18} /> : <Lock size={18} />}
              </StatusTile>
            }
            title={m.wires_channels_access_title()}
            meta={
              publicChannel
                ? m.wires_channels_access_public()
                : m.wires_channels_access_signed_in()
            }
          />
          {actions.map(({ category, action, handler }) => {
            const value: ChannelSelection = { type: 'action', category, action }
            const text = handler.summary || handler.description
            return (
              <HandlerRow
                key={`${category}/${action}`}
                testId={`channel-action-${name}-${category}-${action}`}
                Icon={MessagesSquare}
                title={asI18n(text ? text : humanize(action))}
                meta={m.wires_channels_action_meta({ action })}
                selected={isOpen(value)}
                onOpen={() => onOpen(value)}
              />
            )
          })}
          {handlers.map((entry) => {
            const value: ChannelSelection = { type: 'handler', handler: entry.key }
            const handler = channel[entry.key]!
            return (
              <HandlerRow
                key={entry.key}
                testId={`channel-handler-${name}-${entry.key}`}
                Icon={entry.Icon}
                title={entry.title()}
                meta={
                  handler.summary ? asI18n(handler.summary) : entry.meta()
                }
                selected={isOpen(value)}
                onOpen={() => onOpen(value)}
              />
            )
          })}
        </Stack>
      </SectionCard>
    </Box>
  )
}

export const ChannelCards: React.FC<{
  channels: Record<string, ChannelMeta>
  searchQuery: string
  focusName: string | null
  selectedName?: string
}> = ({ channels, searchQuery, focusName, selectedName }) => {
  const { openPanel, activePanel } = usePanelContext()
  const rows = useMemo(
    () =>
      Object.entries(channels).flatMap(([channelName, channel]) =>
        channelRows(channelName, channel).map((selected) => ({
          channelName,
          channel,
          selected,
        }))
      ),
    [channels]
  )
  const open = (channelName: string, selected: ChannelSelection) =>
    openPanel(
      'channel',
      formatChannelRoute({ channelName, selected }),
      channelRowTitle(channels[channelName]!, selected),
      { message: { channelName, selected } }
    )

  usePanelUrl({
    type: 'channel',
    items: rows,
    getId: (row) => formatChannelRoute(row),
    open: (_id, row) => open(row.channelName, row.selected),
  })

  const visible = useMemo(
    () =>
      Object.entries(channels).filter(
        ([name, channel]) =>
          (!selectedName || selectedName === name) &&
          channelMatches(name, channel, searchQuery)
      ),
    [channels, searchQuery, selectedName]
  )

  if (visible.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        {m.wires_channels_no_match()}
      </Text>
    )
  }

  return (
    <>
      {visible.map(([name, channel]) => (
        <ChannelCard
          key={name}
          name={name}
          channel={channel}
          focused={focusName === name}
          isOpen={(selected) =>
            activePanel ===
            `channel-${formatChannelRoute({ channelName: name, selected })}`
          }
          onOpen={(selected) => open(name, selected)}
        />
      ))}
    </>
  )
}
