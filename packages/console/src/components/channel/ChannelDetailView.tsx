import React, { useMemo } from 'react'
import { Box, Text, Group, Badge, Tabs } from '@mantine/core'
import type { ChannelMeta } from '@pikku/core/channel'
import { usePanelContext } from '../../context/PanelContext'
import { useFunctionMeta, useSchema, useChannelSnippets } from '../../hooks/useWirings'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { CopyableCode } from '../ui/CopyableCode'
import type { ChannelSelection } from './ChannelNavTree'

const MetaRow: React.FunctionComponent<{
  label: string
  children: React.ReactNode
}> = ({ label, children }) => (
  <Box
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '6px 0',
      borderBottom: '1px solid var(--app-row-border)',
    }}
  >
    <Text
      size="sm"
      ff="monospace"
      c="var(--app-meta-label)"
      style={{ minWidth: 85, flexShrink: 0 }}
    >
      {label}
    </Text>
    <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
  </Box>
)

const SLabel: React.FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Text
    size="xs"
    fw={600}
    ff="monospace"
    c="var(--app-section-label)"
    tt="uppercase"
    style={{ letterSpacing: '0.1em', padding: '12px 0 6px' }}
  >
    {children}
  </Text>
)

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
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--app-row-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.01)',
        }}
      >
        <Box style={{ flex: 1 }}>
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
          <Badge
            size="sm"
            variant="light"
            color="cyan"
          >
            Channel
          </Badge>
          {selected?.type === 'action' && (
            <Badge
              size="sm"
              variant="light"
              color="violet"
            >
              {selected.category}
            </Badge>
          )}
          {channel.tags?.map((tag: string) => (
            <Badge
              key={tag}
              size="sm"
              variant="light"
              ff="monospace"
              style={{
                background: 'var(--app-tag-bg)',
                border: '1px solid var(--app-tag-border)',
                color: 'var(--app-tag-color)',
              }}
            >
              {tag}
            </Badge>
          ))}
        </Group>
      </Box>

      {/* Body: detail left + code right */}
      <Box style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: metadata + schema */}
        <Box
          style={{
            flex: 1,
            overflow: 'auto',
            borderRight: '1px solid var(--app-row-border)',
            padding: 16,
          }}
        >
          <SLabel>Handler</SLabel>

          {funcId && (
            <MetaRow label="function">
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                style={{ cursor: 'pointer' }}
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
                  <Badge
                    key={svc}
                    size="sm"
                    variant="light"
                    style={{
                      background: 'var(--app-service-bg)',
                      border: '1px solid var(--app-service-border)',
                      color: 'var(--app-service-color)',
                    }}
                  >
                    {svc}
                  </Badge>
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
                  <Badge
                    key={i}
                    size="sm"
                    variant="light"
                    ff="monospace"
                    style={{
                      background: 'var(--app-tag-bg)',
                      border: '1px solid var(--app-tag-border)',
                      color: 'var(--app-tag-color)',
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
              </Group>
            </MetaRow>
          )}

          {inputSchemaName && (
            <>
              <SLabel>Input</SLabel>
              <SchemaSection schemaName={inputSchemaName} />
            </>
          )}

          {outputSchemaName && (
            <>
              <SLabel>Output</SLabel>
              <SchemaSection schemaName={outputSchemaName} />
            </>
          )}
        </Box>

        {/* Right: code tabs */}
        <Box
          style={{
            flex: 1,
            minWidth: 0,
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
              <Tabs.Tab value="pikku-ws">pikku-ws</Tabs.Tab>
              <Tabs.Tab value="raw-ws">raw WS</Tabs.Tab>
              <Tabs.Tab value="cli">CLI</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel
              value="pikku-ws"
              style={{ flex: 1, overflow: 'auto' }}
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
              style={{ flex: 1, overflow: 'auto' }}
              p="sm"
            >
              <CopyableCode
                code={generateRawWsSnippet(channelName, channel, selected)}
                language="typescript"
              />
            </Tabs.Panel>
            <Tabs.Panel
              value="cli"
              style={{ flex: 1, overflow: 'auto' }}
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
