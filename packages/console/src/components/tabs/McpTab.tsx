import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  TextInput,
  ScrollArea,
  UnstyledButton,
  Group,
  Badge,
  Tabs,
} from '@mantine/core'
import { Search } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { useFunctionMeta, useSchema } from '../../hooks/useWirings'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { CopyableCode } from '../ui/CopyableCode'

const TYPE_DOTS: Record<string, string> = {
  tool: 'rgba(245,158,11,0.7)',
  resource: 'rgba(6,182,212,0.6)',
  prompt: 'rgba(124,58,237,0.7)',
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  tool: 'yellow',
  resource: 'cyan',
  prompt: 'violet',
}

const MetaRow: React.FunctionComponent<{
  label: string
  children: React.ReactNode
}> = ({ label, children }) => (
  <Box
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '6px 0',
      borderBottom: '1px solid var(--app-row-border)',
    }}
  >
    <Text
      size="sm"
      ff="monospace"
      c="var(--app-meta-label)"
      style={{ minWidth: 85, flexShrink: 0, paddingTop: 1 }}
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

const McpDetailPanel: React.FunctionComponent<{ item: any }> = ({ item }) => {
  const { navigateInPanel } = usePanelContext()
  const funcId = item?.pikkuFuncId
  const { data: funcMeta } = useFunctionMeta(funcId ?? '')
  const inputSchemaName = funcMeta?.inputSchemaName
  const outputSchemaName = funcMeta?.outputSchemaName
  const displayName = funcMeta?.name || funcId
  const method = item?.method || 'tool'

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
          <Text size="sm" fw={600} ff="monospace" c="var(--app-meta-value)">
            {item.name || item.wireId || 'unnamed'}
          </Text>
          {displayName && (
            <Text size="xs" ff="monospace" c="var(--app-text-muted)">
              {displayName}()
            </Text>
          )}
        </Box>
        <Badge size="sm" variant="light" color={TYPE_BADGE_COLORS[method]}>
          {method}
        </Badge>
      </Box>

      {/* Body: detail left + config right */}
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
          <SLabel>{method}</SLabel>

          <MetaRow label="name">
            <Text size="sm" ff="monospace" c="var(--app-meta-value)">
              {item.name || item.wireId || 'unnamed'}
            </Text>
          </MetaRow>

          {funcId && (
            <MetaRow label="function">
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  navigateInPanel('function', funcId, displayName || funcId, funcMeta)
                }
              >
                {displayName}
              </Text>
            </MetaRow>
          )}

          {item.description && (
            <MetaRow label="description">
              <Text size="sm" c="var(--app-text)" style={{ lineHeight: 1.6 }}>
                {item.description}
              </Text>
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

        {/* Right: MCP client config */}
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            padding: 16,
          }}
        >
          <Text size="xs" fw={600} ff="monospace" c="var(--app-meta-label)" mb={4}>
            Connect your MCP client
          </Text>
          <Text size="xs" c="var(--app-text-muted)" mb="md" style={{ lineHeight: 1.6 }}>
            All tools, resources, and prompts are available once connected.
          </Text>

          <CopyableCode
            label="Claude Desktop · claude_desktop_config.json"
            code={JSON.stringify({
              mcpServers: {
                pikku: {
                  command: 'npx',
                  args: ['-y', '@pikku/mcp-server', 'http://localhost:4002'],
                },
              },
            }, null, 2)}
            language="json"
          />

          <Box mt="md">
            <CopyableCode
              label="Cursor · .cursor/mcp.json"
              code={JSON.stringify({
                mcpServers: {
                  pikku: {
                    command: 'npx',
                    args: ['-y', '@pikku/mcp-server', 'http://localhost:4002'],
                  },
                },
              }, null, 2)}
              language="json"
            />
          </Box>

          <Box
            mt="md"
            p="sm"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-row-border)',
              borderRadius: 8,
            }}
          >
            <Text size="xs" fw={600} ff="monospace" c="var(--app-section-label)" tt="uppercase" mb={8}>
              SSE endpoint · any client
            </Text>
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--app-input-bg)',
                border: '1px solid var(--app-row-border)',
                borderRadius: 6,
                padding: '7px 10px',
              }}
            >
              <Text size="xs" ff="monospace" c="var(--app-tag-color)" style={{ flex: 1 }}>
                http://localhost:4002/mcp
              </Text>
            </Box>
            <Text size="xs" c="var(--app-text-muted)" mt={8} style={{ lineHeight: 1.6 }}>
              Use this URL directly in any MCP-compatible client that supports SSE transport.
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export const McpTab: React.FunctionComponent = () => {
  const { meta } = usePikkuMeta()
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const items = useMemo(() => {
    if (!meta.mcpMeta) return []
    return [...meta.mcpMeta].sort((a: any, b: any) =>
      (a.name || '').localeCompare(b.name || '')
    )
  }, [meta.mcpMeta])

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = { tool: [], resource: [], prompt: [] }
    const q = search.toLowerCase()
    for (const item of items) {
      const method = item.method || 'tool'
      if (q && !item.name?.toLowerCase().includes(q) && !item.pikkuFuncId?.toLowerCase().includes(q)) continue
      if (!groups[method]) groups[method] = []
      groups[method].push(item)
    }
    return groups
  }, [items, search])

  const selectedItem = useMemo(() => {
    if (!selected) return null
    return items.find((i: any) => `${i.method}::${i.wireId || i.name}` === selected) || null
  }, [items, selected])

  const itemCount = items.length

  return (
    <Box style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar */}
      <Box
        style={{
          width: 280,
          minWidth: 220,
          borderRight: '1px solid var(--app-row-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <Box p="xs">
          <Group justify="space-between" mb={6}>
            <Text size="xs" fw={600} ff="monospace" c="var(--app-meta-label)">
              MCP
            </Text>
            <Text size="xs" ff="monospace" c="dimmed">
              {itemCount} items
            </Text>
          </Group>
          <TextInput
            placeholder="Search..."
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="xs"
          />
        </Box>
        <ScrollArea style={{ flex: 1 }}>
          {Object.entries(grouped).map(([type, typeItems]) => {
            if (typeItems.length === 0) return null
            return (
              <React.Fragment key={type}>
                {/* Group label */}
                <Box
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px 4px',
                  }}
                >
                  <Text
                    size="xs"
                    ff="monospace"
                    c="var(--app-section-label)"
                    tt="uppercase"
                    style={{ letterSpacing: '0.1em', fontSize: 9 }}
                  >
                    {type}s
                  </Text>
                  <Box style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                </Box>

                {typeItems.map((item: any) => {
                  const key = `${item.method}::${item.wireId || item.name}`
                  const isActive = selected === key
                  return (
                    <UnstyledButton
                      key={key}
                      onClick={() => setSelected(key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '6px 12px',
                        borderLeft: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                        background: isActive ? 'rgba(124,58,237,0.06)' : undefined,
                        width: '100%',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <Box
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: TYPE_DOTS[item.method || 'tool'],
                        }}
                      />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          size="xs"
                          ff="monospace"
                          c={isActive ? 'var(--app-meta-value)' : 'var(--app-text)'}
                          truncate
                        >
                          {item.name || item.wireId || 'unnamed'}
                        </Text>
                        {item.pikkuFuncId && (
                          <Text
                            size="xs"
                            ff="monospace"
                            c={isActive ? 'var(--app-meta-label)' : 'var(--app-text-muted)'}
                            truncate
                            style={{ fontSize: 9 }}
                          >
                            {item.pikkuFuncId}()
                          </Text>
                        )}
                      </Box>
                    </UnstyledButton>
                  )
                })}
              </React.Fragment>
            )
          })}
        </ScrollArea>
      </Box>

      {/* Main + Right */}
      <Box style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        {selectedItem ? (
          <McpDetailPanel item={selectedItem} />
        ) : (
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text c="dimmed" ff="monospace" size="sm">
              Select a tool, resource, or prompt
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
