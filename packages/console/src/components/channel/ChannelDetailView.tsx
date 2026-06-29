import React, { useMemo } from 'react'
import { Box, Text, Group, Badge, Tabs } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
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
  const { t } = useI18n()
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
      <Box
        className={classes.detailHeader}
        style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.01)' }}
      >
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
            {t('channel.badge.channel')}
          </Badge>
          {selected?.type === 'action' && (
            <Badge size="sm" variant="light" color="violet">
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
          <SectionLabel>{t('channel.section.handler')}</SectionLabel>

          {funcId && (
            <MetaRow label={t('channel.meta.function')}>
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

          <MetaRow label={t('channel.meta.channel')}>
            <Text size="sm" ff="monospace" c="var(--app-meta-value)">
              {asI18n(channelName)}
            </Text>
          </MetaRow>

          {selected?.type === 'handler' && (
            <MetaRow label={t('channel.meta.type')}>
              <Text size="sm" ff="monospace" c="var(--app-meta-value)">
                {selected.handler === 'connect'
                  ? t('channel.type.connect')
                  : selected.handler === 'disconnect'
                    ? t('channel.type.disconnect')
                    : t('channel.type.receive')}
              </Text>
            </MetaRow>
          )}

          {selected?.type === 'action' && (
            <MetaRow label={t('channel.meta.routing')}>
              <Box
                style={{
                  background: 'var(--app-code-bg)',
                  border: '1px solid var(--app-row-border)',
                  borderRadius: 5,
                  padding: '5px 8px',
                  fontSize: 10,
                }}
              >
                <Text component="span" c="violet" size="sm" ff="monospace">
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
            <MetaRow label={t('channel.meta.services')}>
              <Group gap={4}>
                {funcMeta.services.services.map((svc: string) => (
                  <ServiceBadge key={svc}>{asI18n(svc)}</ServiceBadge>
                ))}
              </Group>
            </MetaRow>
          )}

          {selectedData?.meta?.middleware &&
            selectedData.meta.middleware.length > 0 && (
              <MetaRow label={t('channel.meta.middleware')}>
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
            <MetaRow label={t('channel.meta.tags')}>
              <Group gap={4}>
                {channel.tags.map((tag: string, i: number) => (
                  <TagBadge key={i}>{asI18n(tag)}</TagBadge>
                ))}
              </Group>
            </MetaRow>
          )}

          {inputSchemaName && (
            <>
              <SectionLabel>{t('channel.section.input')}</SectionLabel>
              <SchemaSection schemaName={inputSchemaName} />
            </>
          )}

          {outputSchemaName && (
            <>
              <SectionLabel>{t('channel.section.output')}</SectionLabel>
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
              <Tabs.Tab value="raw-ws">{t('channel.tab.rawWs')}</Tabs.Tab>
              <Tabs.Tab value="cli">{t('channel.tab.cli')}</Tabs.Tab>
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
                  {t('channel.empty.selectHandler')}
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
                {t('channel.empty.cliNotAvailable')}
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
