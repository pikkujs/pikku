import React, { useMemo } from 'react'
import { Box, Text, Group, Badge, Tabs } from '@mantine/core'
import type { ChannelMeta } from '@pikku/core/channel'
import { usePanelContext } from '../../context/PanelContext'
import { useFunctionMeta, useSchema, useChannelSnippets } from '../../hooks/useWirings'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { CopyableCode } from '../ui/CopyableCode'
import { MetaRow } from '../ui/MetaRow'
import { SectionLabel } from '../ui/SectionLabel'
import { TagBadge, ServiceBadge } from '../ui/TagBadge'
import classes from '../ui/console.module.css'
import type { ChannelSelection } from './ChannelNavTree'

const getSelectedMeta = (
  channel: ChannelMeta,
  selected: ChannelSelection
) => {
  if (!selected) return null
  if (selected.type === 'handler') {
    const meta = channel[selected.handler as 'connect' | 'disconnect' | 'message']
    return meta ? { pikkuFuncId: meta.pikkuFuncId, meta } : null
  }
  const actionMeta = channel.messageWirings?.[selected.category]?.[selected.action]
  return actionMeta ? { pikkuFuncId: actionMeta.pikkuFuncId, meta: actionMeta } : null
}

const getSnippet = (
  snippets: { overview: string; handlers: Record<string, string>; actions: Record<string, Record<string, string>> } | undefined,
  selected: ChannelSelection
): string | null => {
  if (!snippets) return null
  if (!selected) return snippets.overview || null
  if (selected.type === 'handler') return snippets.handlers[selected.handler] || null
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

export const ChannelDetailView: React.FunctionComponent<ChannelDetailViewProps> = ({
  channelName,
  channel,
  selected,
}) => {
  const { navigateInPanel } = usePanelContext()
  const selectedData = getSelectedMeta(channel, selected)
  const funcId = selectedData?.pikkuFuncId
  const { data: funcMeta } = useFunctionMeta(funcId ?? '')
  const inputSchemaName = funcMeta?.inputSchemaName
  const outputSchemaName = funcMeta?.outputSchemaName
  const { data: snippets } = useChannelSnippets(channelName)

  const snippet = useMemo(() => getSnippet(snippets, selected), [snippets, selected])
  const displayName = funcMeta?.name || funcId
  const breadcrumb = getBreadcrumb(channelName, selected)
  const title = getTitle(selected)
  const typeBadge = getTypeBadge(selected)

  return (
    <Box className={classes.flexColumn}>
      {/* Header */}
      <Box className={classes.detailHeader} style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.01)' }}>
        <Box className={classes.flexGrow}>
          <Text size="xs" ff="monospace" c="var(--app-section-label)">
            {breadcrumb}
          </Text>
          {title && (
            <Text size="sm" fw={600} ff="monospace" c="var(--app-meta-value)">
              {title}
            </Text>
          )}
          {displayName && (
            <Text size="xs" ff="monospace" c="dimmed">
              {displayName}()
            </Text>
          )}
        </Box>
        <Group gap={6}>
          <Badge size="sm" variant="light" color="cyan">
            Channel
          </Badge>
          {selected?.type === 'action' && (
            <Badge size="sm" variant="light" color="violet">
              {selected.category}
            </Badge>
          )}
          {channel.tags?.map((tag: string) => (
            <TagBadge key={tag}>{tag}</TagBadge>
          ))}
        </Group>
      </Box>

      {/* Body: detail left + code right */}
      <Box className={classes.flexRow} style={{ flex: 1, minHeight: 0 }}>
        {/* Left: metadata + schema */}
        <Box className={classes.splitLeft}>
          <SectionLabel>Handler</SectionLabel>

          {funcId && (
            <MetaRow label="function">
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                className={classes.clickableText}
                onClick={() => navigateInPanel('function', funcId, displayName || funcId, funcMeta)}
              >
                {displayName}
              </Text>
            </MetaRow>
          )}

          <MetaRow label="channel">
            <Text size="sm" ff="monospace" c="var(--app-meta-value)">
              {channelName}
            </Text>
          </MetaRow>

          {selected?.type === 'handler' && (
            <MetaRow label="type">
              <Text size="sm" ff="monospace" c="var(--app-meta-value)">
                {selected.handler === 'connect' ? 'connect (client → server)' :
                 selected.handler === 'disconnect' ? 'disconnect (client → server)' :
                 'receive (server → client)'}
              </Text>
            </MetaRow>
          )}

          {selected?.type === 'action' && (
            <MetaRow label="routing">
              <Box
                style={{
                  background: '#111827',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 5,
                  padding: '5px 8px',
                  fontSize: 10,
                }}
              >
                <Text component="span" c="violet" size="xs" ff="monospace">
                  {selected.category}
                </Text>
                <Text component="span" c="dimmed" size="xs" ff="monospace">
                  :{' '}
                </Text>
                <Text component="span" c="green" size="xs" ff="monospace">
                  &quot;{selected.action}&quot;
                </Text>
              </Box>
            </MetaRow>
          )}

          {funcMeta?.services && funcMeta.services.length > 0 && (
            <MetaRow label="services">
              <Group gap={4}>
                {funcMeta.services.map((svc: string) => (
                  <ServiceBadge key={svc}>{svc}</ServiceBadge>
                ))}
              </Group>
            </MetaRow>
          )}

          {selectedData?.meta?.middleware && selectedData.meta.middleware.length > 0 && (
            <MetaRow label="middleware">
              <Group gap={4}>
                {selectedData.meta.middleware.map((mw: any, i: number) => (
                  <Badge key={i} size="sm" variant="light" color="gray">
                    {typeof mw === 'string' ? mw : mw.type || 'middleware'}
                  </Badge>
                ))}
              </Group>
            </MetaRow>
          )}

          {channel.tags && channel.tags.length > 0 && (
            <MetaRow label="tags">
              <Group gap={4}>
                {channel.tags.map((tag: string, i: number) => (
                  <TagBadge key={i}>{tag}</TagBadge>
                ))}
              </Group>
            </MetaRow>
          )}

          {inputSchemaName && (
            <>
              <SectionLabel>Input</SectionLabel>
              <SchemaSection schemaName={inputSchemaName} />
            </>
          )}

          {outputSchemaName && (
            <>
              <SectionLabel>Output</SectionLabel>
              <SchemaSection schemaName={outputSchemaName} />
            </>
          )}
        </Box>

        {/* Right: code tabs */}
        <Box className={classes.flexGrow} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
              <Tabs.Tab value="pikku-ws">pikku-ws</Tabs.Tab>
              <Tabs.Tab value="raw-ws">raw WS</Tabs.Tab>
              <Tabs.Tab value="cli">CLI</Tabs.Tab>
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
                  Select a handler or action to see client code
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
                CLI client not available for channels
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
    `const ws = new WebSocket('ws://localhost:4002${route}')`,
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
