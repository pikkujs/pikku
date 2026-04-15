import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  ScrollArea,
  Badge,
} from '@mantine/core'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { useFunctionMeta } from '../../hooks/useWirings'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { CopyableCode } from '../ui/CopyableCode'
import { MetaRow } from '../ui/MetaRow'
import { SectionLabel } from '../ui/SectionLabel'
import { ListDetailLayout } from '../ui/ListDetailLayout'
import { SearchInput } from '../ui/SearchInput'
import { EmptyState } from '../ui/EmptyState'
import { ListItem } from '../ui/ListItem'
import classes from '../ui/console.module.css'

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

const McpDetailPanel: React.FunctionComponent<{ item: any }> = ({ item }) => {
  const { navigateInPanel } = usePanelContext()
  const funcId = item?.pikkuFuncId
  const { data: funcMeta } = useFunctionMeta(funcId ?? '')
  const inputSchemaName = funcMeta?.inputSchemaName
  const outputSchemaName = funcMeta?.outputSchemaName
  const displayName = funcMeta?.name || funcId
  const method = item?.method || 'tool'

  return (
    <Box className={classes.flexColumn}>
      {/* Header */}
      <Box className={classes.detailHeader} style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.01)' }}>
        <Box className={classes.flexGrow}>
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
      <Box className={classes.flexRow} style={{ flex: 1, minHeight: 0 }}>
        {/* Left: metadata + schema */}
        <Box className={classes.splitLeft}>
          <SectionLabel>{method}</SectionLabel>

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
                className={classes.clickableText}
                onClick={() =>
                  navigateInPanel('function', funcId, displayName || funcId, funcMeta)
                }
              >
                {displayName}
              </Text>
            </MetaRow>
          )}

          {item.description && (
            <MetaRow label="description" align="flex-start">
              <Text size="sm" c="var(--app-text)" lh={1.6}>
                {item.description}
              </Text>
            </MetaRow>
          )}

          {inputSchemaName && (
            <>
              <SectionLabel>Input Schema</SectionLabel>
              <SchemaSection schemaName={inputSchemaName} />
            </>
          )}

          {outputSchemaName && (
            <>
              <SectionLabel>Output Schema</SectionLabel>
              <SchemaSection schemaName={outputSchemaName} />
            </>
          )}
        </Box>

        {/* Right: MCP client config */}
        <Box className={classes.splitRight}>
          <Text size="xs" fw={600} ff="monospace" c="var(--app-meta-label)" mb={4}>
            Connect your MCP client
          </Text>
          <Text size="xs" c="var(--app-text-muted)" mb="md" lh={1.6}>
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

          <Box mt="md" p="sm" className={classes.surfaceCard}>
            <Text size="xs" fw={600} ff="monospace" c="var(--app-section-label)" tt="uppercase" mb={8}>
              SSE endpoint · any client
            </Text>
            <Box className={classes.codeInputBox}>
              <Text size="xs" ff="monospace" c="var(--app-tag-color)" className={classes.flexGrow}>
                http://localhost:4002/mcp
              </Text>
            </Box>
            <Text size="xs" c="var(--app-text-muted)" mt={8} lh={1.6}>
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

  const list = (
    <>
      <SearchInput
        value={search}
        onChange={setSearch}
        label="MCP"
        count={items.length}
      />
      <ScrollArea className={classes.flexGrow}>
        {Object.entries(grouped).map(([type, typeItems]) => {
          if (typeItems.length === 0) return null
          return (
            <React.Fragment key={type}>
              <Box className={classes.groupLabel}>
                <Text
                  size="xs"
                  ff="monospace"
                  c="var(--app-section-label)"
                  tt="uppercase"
                  className={classes.gridHeaderLabel}
                >
                  {type}s
                </Text>
                <Box className={classes.separator} />
              </Box>

              {typeItems.map((item: any) => {
                const key = `${item.method}::${item.wireId || item.name}`
                const isActive = selected === key
                return (
                  <ListItem
                    key={key}
                    active={isActive}
                    onClick={() => setSelected(key)}
                    padding="6px 12px"
                  >
                    <Box style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%' }}>
                      <Box
                        className={classes.typeDot}
                        style={{ background: TYPE_DOTS[item.method || 'tool'] }}
                      />
                      <Box className={classes.flexGrow}>
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
                    </Box>
                  </ListItem>
                )
              })}
            </React.Fragment>
          )
        })}
      </ScrollArea>
    </>
  )

  return (
    <ListDetailLayout
      listWidth={280}
      list={list}
      detail={selectedItem ? <McpDetailPanel item={selectedItem} /> : null}
      hasSelection={!!selectedItem}
      emptyMessage="Select a tool, resource, or prompt"
    />
  )
}
