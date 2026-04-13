import React, { useMemo } from 'react'
import { Box, Text, Group, Tabs, Badge } from '@mantine/core'
import { useFunctionMeta, useSchema } from '../../hooks/useWirings'
import { usePanelContext } from '../../context/PanelContext'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { CopyableCode } from '../ui/CopyableCode'
import { PikkuBadge } from '../ui/PikkuBadge'
import { LinkedBadge } from '../project/panels/LinkedBadge'
import {
  generateCurlSnippet,
  generateFetchSnippet,
  generatePikkuFetchSnippet,
} from './httpSnippets'

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

interface HttpTabbedPanelProps {
  wireId: string
  metadata: any
}

export const HttpTabbedPanel: React.FunctionComponent<HttpTabbedPanelProps> = ({
  wireId,
  metadata,
}) => {
  const { navigateInPanel } = usePanelContext()
  const { data: funcMeta } = useFunctionMeta(metadata?.pikkuFuncId || '')
  const inputSchemaName = funcMeta?.inputSchemaName
  const outputSchemaName = funcMeta?.outputSchemaName
  const { data: inputSchema } = useSchema(inputSchemaName)

  const method = (metadata?.method || 'GET').toUpperCase()
  const route = metadata?.route || '/'
  const funcId = metadata?.pikkuFuncId
  const displayName = funcMeta?.name || funcId

  const curlSnippet = useMemo(
    () => generateCurlSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )
  const fetchSnippet = useMemo(
    () => generateFetchSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )
  const pikkuSnippet = useMemo(
    () => generatePikkuFetchSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header bar */}
      <Box
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.01)',
        }}
      >
        <PikkuBadge type="httpMethod" value={method} />
        <Box style={{ flex: 1 }}>
          <Text size="sm" ff="monospace" fw={600} c="gray.2">
            {route}
          </Text>
          <Text size="xs" c="dimmed">
            {displayName}
          </Text>
        </Box>
        <Group gap={6}>
          {metadata?.auth !== false && (
            <PikkuBadge type="flag" flag="auth" />
          )}
          {metadata?.sse && (
            <PikkuBadge type="flag" flag="sse" />
          )}
          {metadata?.tags?.map((tag: string) => (
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
            borderRight: '1px solid rgba(255,255,255,0.06)',
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
                onClick={() =>
                  navigateInPanel('function', funcId, displayName, funcMeta)
                }
              >
                {displayName}
              </Text>
            </MetaRow>
          )}

          {metadata?.sse && (
            <MetaRow label="transport">
              <Text size="xs" c="gray.4">SSE stream</Text>
            </MetaRow>
          )}

          {metadata?.middleware && metadata.middleware.length > 0 && (
            <MetaRow label="middleware">
              <Group gap={4}>
                {metadata.middleware.map((mw: any, i: number) => (
                  <LinkedBadge key={i} item={mw} kind="middleware" />
                ))}
              </Group>
            </MetaRow>
          )}

          {metadata?.permissions && metadata.permissions.length > 0 && (
            <MetaRow label="permissions">
              <Group gap={4}>
                {metadata.permissions.map((p: any, i: number) => (
                  <LinkedBadge key={i} item={p} kind="permission" />
                ))}
              </Group>
            </MetaRow>
          )}

          {funcMeta?.services && funcMeta.services.length > 0 && (
            <MetaRow label="services">
              <Group gap={4}>
                {funcMeta.services.map((svc: string) => (
                  <PikkuBadge
                    key={svc}
                    type="dynamic"
                    badge="service"
                    value={svc}
                  />
                ))}
              </Group>
            </MetaRow>
          )}

          {inputSchemaName && (
            <>
              <SLabel>Input Schema</SLabel>
              <SchemaSection schemaName={inputSchemaName} />
            </>
          )}

          {outputSchemaName && (
            <>
              <SLabel>Output Schema</SLabel>
              <SchemaSection schemaName={outputSchemaName} />
            </>
          )}
        </Box>

        {/* Right: code tabs + try it */}
        <Box
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <Tabs
            defaultValue="pikku-fetch"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <Tabs.List>
              <Tabs.Tab value="pikku-fetch">
                pikku-fetch
              </Tabs.Tab>
              <Tabs.Tab value="fetch">
                fetch
              </Tabs.Tab>
              <Tabs.Tab value="curl">
                curl
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel
              value="pikku-fetch"
              style={{ flex: 1, overflow: 'auto' }}
              p="sm"
            >
              <CopyableCode code={pikkuSnippet} language="typescript" />
            </Tabs.Panel>
            <Tabs.Panel
              value="fetch"
              style={{ flex: 1, overflow: 'auto' }}
              p="sm"
            >
              <CopyableCode code={fetchSnippet} language="typescript" />
            </Tabs.Panel>
            <Tabs.Panel
              value="curl"
              style={{ flex: 1, overflow: 'auto' }}
              p="sm"
            >
              <CopyableCode code={curlSnippet} language="bash" />
            </Tabs.Panel>
          </Tabs>
        </Box>
      </Box>
    </Box>
  )
}
