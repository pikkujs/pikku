import React, { useMemo } from 'react'
import { Box, Text, Group, Badge, Tabs } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import type { ChannelMeta } from '@pikku/core/channel'
import { usePanelContext } from '../../context/PanelContext'
import {
  useFunctionMeta,
  useSchema,
  useChannelSnippets,
} from '../../hooks/useWirings'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { CopyableCode } from '../ui/CopyableCode'
import { MetaRow } from '../ui/MetaRow'
import { SectionLabel } from '../ui/SectionLabel'
import { TagBadge, ServiceBadge } from '../ui/TagBadge'
import classes from '../ui/console.module.css'
import type { ChannelSelection } from './ChannelNavTree'

const getSelectedMeta = (channel: ChannelMeta, selected: ChannelSelection) => {
  if (!selected) return null
  if (selected.type === 'handler') {
    const meta =
      channel[selected.handler as 'connect' | 'disconnect' | 'message']
    return meta ? { pikkuFuncId: meta.pikkuFuncId, meta } : null
  }
  const actionMeta =
    channel.messageWirings?.[selected.category]?.[selected.action]
  return actionMeta
    ? { pikkuFuncId: actionMeta.pikkuFuncId, meta: actionMeta }
    : null
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

const getBreadcrumb = (channelName: string, selected: ChannelSelection) => {
  if (!selected) return channelName
  if (selected.type === 'handler') return `${channelName} / ${selected.handler}`
  return `${channelName} / ${selected.category} / ${selected.action}`
}

const getTitle = (selected: ChannelSelection) => {
  if (!selected) return null
  if (selected.type === 'handler') return selected.handler
  return selected.action
}

const getTypeBadge = (selected: ChannelSelection) => {
  if (!selected) return 'overview'
  if (selected.type === 'handler') return selected.handler
  return 'action'
}

interface ChannelDetailViewProps {
  channelName: string
  channel: ChannelMeta
  selected: ChannelSelection
}

export const ChannelDetailView: React.FC<ChannelDetailViewProps> = ({
  channelName,
  channel,
  selected,
}) => {
  const { navigateInPanel } = usePanelContext()
  useLocale()
  const selectedData = getSelectedMeta(channel, selected)
  const funcId = selectedData?.pikkuFuncId
  const { data: funcMeta } = useFunctionMeta(funcId ?? '')
  const inputSchemaName = funcMeta?.inputSchemaName
  const outputSchemaName = funcMeta?.outputSchemaName
  const { data: snippets } = useChannelSnippets(channelName)

  const snippet = useMemo(
    () => getSnippet(snippets, selected),
    [snippets, selected]
  )
  const displayName = funcMeta?.name || funcId
  const breadcrumb = getBreadcrumb(channelName, selected)
  const title = getTitle(selected)
  const typeBadge = getTypeBadge(selected)

  return (
    <Box className={classes.flexColumn}>
      {/* Header */}
      <Box className={classes.detailHeader} style={{ padding: '10px 16px' }}>
        <Box className={classes.flexGrow}>
          <Text size="sm" ff="monospace" c="var(--app-section-label)">
            {asI18n(breadcrumb)}
          </Text>
          {title && (
            <Text size="sm" fw={600} ff="monospace" c="var(--app-meta-value)">
              {asI18n(title)}
            </Text>
          )}
          {displayName && (
            <Text size="sm" ff="monospace" c="dimmed">
              {asI18n(`${displayName}()`)}
            </Text>
          )}
        </Box>
        <Group gap={6}>
          <Badge size="sm" variant="light" color="cyan">
            {m.channel_badge_channel()}
          </Badge>
          {selected?.type === 'action' && (
            <Badge size="sm" variant="light" color="gray">
              {asI18n(selected.category)}
            </Badge>
          )}
          {channel.tags?.map((tag: string) => (
            <TagBadge key={tag}>{asI18n(tag)}</TagBadge>
          ))}
        </Group>
      </Box>

      {/* Body: detail left + code right */}
      <Box className={classes.flexRow} style={{ flex: 1, minHeight: 0 }}>
        {/* Left: metadata + schema */}
        <Box className={classes.splitLeft}>
          <SectionLabel>{m.channel_section_handler()}</SectionLabel>

          {funcId && (
            <MetaRow label={m.channel_meta_function()}>
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                className={classes.clickableText}
                onClick={() =>
                  navigateInPanel(
                    'function',
                    funcId,
                    displayName || funcId,
                    funcMeta
                  )
                }
              >
                {asI18n(displayName ?? '')}
              </Text>
            </MetaRow>
          )}

          <MetaRow label={m.channel_meta_channel()}>
            <Text size="sm" ff="monospace" c="var(--app-meta-value)">
              {asI18n(channelName)}
            </Text>
          </MetaRow>

          {selected?.type === 'handler' && (
            <MetaRow label={m.channel_meta_type()}>
              <Text size="sm" ff="monospace" c="var(--app-meta-value)">
                {selected.handler === 'connect'
                  ? m.channel_type_connect()
                  : selected.handler === 'disconnect'
                    ? m.channel_type_disconnect()
                    : m.channel_type_receive()}
              </Text>
            </MetaRow>
          )}

          {selected?.type === 'action' && (
            <MetaRow label={m.channel_meta_routing()}>
              <Box
                style={{
                  background: 'var(--app-code-bg)',
                  border: '1px solid var(--app-row-border)',
                  borderRadius: 5,
                  padding: '5px 8px',
                  fontSize: 11,
                }}
              >
                <Text component="span" c="var(--app-accent)" size="sm" ff="monospace">
                  {asI18n(selected.category)}
                </Text>
                <Text component="span" c="dimmed" size="sm" ff="monospace">
                  {asI18n(': ')}
                </Text>
                <Text component="span" c="green" size="sm" ff="monospace">
                  {asI18n(`"${selected.action}"`)}
                </Text>
              </Box>
            </MetaRow>
          )}

          {funcMeta?.services && funcMeta.services.services.length > 0 && (
            <MetaRow label={m.channel_meta_services()}>
              <Group gap={4}>
                {funcMeta.services.services.map((svc: string) => (
                  <ServiceBadge key={svc}>{asI18n(svc)}</ServiceBadge>
                ))}
              </Group>
            </MetaRow>
          )}

          {selectedData?.meta?.middleware &&
            selectedData.meta.middleware.length > 0 && (
              <MetaRow label={m.channel_meta_middleware()}>
                <Group gap={4}>
                  {selectedData.meta.middleware.map((mw: any, i: number) => (
                    <Badge key={i} size="sm" variant="light" color="gray">
                      {asI18n(typeof mw === 'string' ? mw : mw.type || 'middleware')}
                    </Badge>
                  ))}
                </Group>
              </MetaRow>
            )}

          {channel.tags && channel.tags.length > 0 && (
            <MetaRow label={m.channel_meta_tags()}>
              <Group gap={4}>
                {channel.tags.map((tag: string, i: number) => (
                  <TagBadge key={i}>{asI18n(tag)}</TagBadge>
                ))}
              </Group>
            </MetaRow>
          )}

          {inputSchemaName && (
            <>
              <SectionLabel>{m.channel_section_input()}</SectionLabel>
              <SchemaSection schemaName={inputSchemaName} />
            </>
          )}

          {outputSchemaName && (
            <>
              <SectionLabel>{m.channel_section_output()}</SectionLabel>
              <SchemaSection schemaName={outputSchemaName} />
            </>
          )}
        </Box>

        {/* Right: code tabs */}
        <Box
          className={classes.flexGrow}
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Tabs
            defaultValue="pikku-ws"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <Tabs.List>
              <Tabs.Tab value="pikku-ws">{asI18n('pikku-ws')}</Tabs.Tab>
              <Tabs.Tab value="raw-ws">{m.channel_tab_raw_ws()}</Tabs.Tab>
              <Tabs.Tab value="cli">{m.channel_tab_cli()}</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel
              value="pikku-ws"
              className={classes.overflowAuto}
              style={{ flex: 1 }}
              p="sm"
            >
              {snippet ? (
                <CopyableCode code={snippet} language="typescript" />
              ) : (
                <Text size="sm" c="dimmed">
                  {m.channel_empty_select_handler()}
                </Text>
              )}
            </Tabs.Panel>
            <Tabs.Panel
              value="raw-ws"
              className={classes.overflowAuto}
              style={{ flex: 1 }}
              p="sm"
            >
              <CopyableCode
                code={generateRawWsSnippet(channelName, channel, selected)}
                language="typescript"
              />
            </Tabs.Panel>
            <Tabs.Panel
              value="cli"
              className={classes.overflowAuto}
              style={{ flex: 1 }}
              p="sm"
            >
              <Text size="sm" c="dimmed">
                {m.channel_empty_cli_not_available()}
              </Text>
            </Tabs.Panel>
          </Tabs>
        </Box>
      </Box>
    </Box>
  )
}

function generateRawWsSnippet(
  channelName: string,
  channel: ChannelMeta,
  selected: ChannelSelection
): string {
  const route = channel.route || '/'
  const lines: string[] = [
    `const ws = new WebSocket('ws://localhost:3000${route}')`,
    ``,
    `ws.onopen = () => {`,
  ]

  if (selected?.type === 'action') {
    lines.push(`  ws.send(JSON.stringify({`)
    lines.push(`    ${selected.category}: '${selected.action}',`)
    lines.push(`    // add your data here`)
    lines.push(`  }))`)
  } else {
    lines.push(`  console.log('Connected to ${channelName}')`)
  }

  lines.push(`}`)
  lines.push(``)
  lines.push(`ws.onmessage = (e) => {`)
  lines.push(`  const data = JSON.parse(e.data)`)
  lines.push(`  console.log(data)`)
  lines.push(`}`)

  return lines.join('\n')
}
