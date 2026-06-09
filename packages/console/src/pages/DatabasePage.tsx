import React, { useState, useEffect, useRef, memo } from 'react'
import { Box, Center, ActionIcon, Loader, Text, Group, Tooltip, SegmentedControl, TextInput, useMantineColorScheme } from '@mantine/core'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BackgroundVariant,
  MarkerType,
} from 'reactflow'
import type { NodeProps, Node, Edge, ReactFlowInstance } from 'reactflow'
import { useQuery } from '@tanstack/react-query'
import ELK from 'elkjs/lib/elk.bundled.js'
import { Database as DatabaseIcon, Key, Link, RefreshCw, Globe, Shield, LockKeyhole, UserCheck, Table2, Search } from 'lucide-react'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { usePanelContext } from '../context/PanelContext'
import { ListPageHeader } from '../components/layout/PageLayout'
import { PikkuToggle } from '../components/ui/PikkuToggle'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import classes from '../components/ui/console.module.css'
import 'reactflow/dist/style.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type Classification = 'public' | 'private' | 'pii' | 'secret'
type ClassificationFilter = 'all' | Classification

interface DbColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  classification: Classification
  foreignKey?: { table: string; column: string }
  enumType?: string
}

interface DbTable {
  name: string
  columns: DbColumn[]
}

interface DbEnum {
  name: string
  schema: string
  values: string[]
}

interface DbSchema {
  tables: DbTable[]
  enums: DbEnum[]
}

interface DatabaseSchemaNodeData {
  label: string
  columns: DbColumn[]
}

interface EnumSchemaNodeData {
  label: string
  values: string[]
}

// ── Classification colors ─────────────────────────────────────────────────────

const CLASSIFICATION_ICON: Record<Classification, React.ReactNode> = {
  public: <Globe size={10} color="var(--mantine-color-teal-5)" />,
  private: <Shield size={10} color="var(--mantine-color-orange-5)" />,
  pii: <UserCheck size={10} color="var(--mantine-color-violet-5)" />,
  secret: <LockKeyhole size={10} color="var(--mantine-color-red-5)" />,
}

// ── DatabaseSchemaNode ────────────────────────────────────────────────────────

const DatabaseSchemaNode = memo(function DatabaseSchemaNode({
  data,
  id,
}: NodeProps<DatabaseSchemaNodeData>) {
  const tableName = data.label?.trim() || id
  const { colorScheme } = useMantineColorScheme()
  const { openDbColumn } = usePanelContext()
  const isDark = colorScheme === 'dark'

  const border = isDark ? 'var(--mantine-color-dark-4)' : 'var(--app-glass-border, #e0e0e0)'
  const headerBg = isDark ? 'var(--mantine-color-dark-5)' : 'var(--mantine-color-blue-0, #e7f5ff)'
  const badgeBg = isDark ? 'var(--mantine-color-dark-4)' : '#f0f0f0'
  const badgeColor = isDark ? 'var(--mantine-color-dark-1)' : '#888'
  const rowBorder = isDark ? 'var(--mantine-color-dark-5)' : '#f0f0f0'
  const typeBg = isDark ? 'var(--mantine-color-dark-4)' : '#f5f5f5'
  const typeColor = isDark ? 'var(--mantine-color-dark-1)' : '#888'
  const nullableColor = isDark ? 'var(--mantine-color-dark-2)' : '#aaa'

  const hiddenHandle: React.CSSProperties = {
    opacity: 0,
    pointerEvents: 'none',
    width: 8,
    height: 8,
    minWidth: 0,
    minHeight: 0,
  }

  return (
    <div
      style={{
        minWidth: 260,
        border: `1px solid ${border}`,
        borderRadius: 8,
        backgroundColor: 'var(--mantine-color-body)',
        boxShadow: isDark ? '0 1px 4px rgba(0,0,0,.4)' : '0 1px 4px rgba(0,0,0,.08)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: headerBg,
          borderBottom: `1px solid ${border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Table2 size={14} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'monospace',
            fontWeight: 600,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {tableName}
        </span>
        <span
          style={{
            fontSize: 11,
            color: badgeColor,
            backgroundColor: badgeBg,
            padding: '1px 6px',
            borderRadius: 10,
            flexShrink: 0,
          }}
        >
          {data.columns.length}
        </span>
      </div>

      <div style={{ padding: '4px 0' }}>
        {data.columns.map((col) => (
          <div
            key={col.name}
            onClick={() => openDbColumn(tableName, col.name, col)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderBottom: `1px solid ${rowBorder}`,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {col.isPrimaryKey && (
                <Key size={11} color="var(--mantine-color-yellow-6)" />
              )}
              {col.foreignKey && !col.isPrimaryKey && (
                <Link size={11} color="var(--mantine-color-blue-5)" />
              )}
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: col.isPrimaryKey ? 600 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.name}
              </span>
            </div>

            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                color: typeColor,
                backgroundColor: typeBg,
                padding: '1px 5px',
                borderRadius: 4,
                flexShrink: 0,
              }}
            >
              {col.type}
            </span>

            {col.nullable && (
              <span style={{ fontSize: 11, color: nullableColor, flexShrink: 0 }}>?</span>
            )}

            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {CLASSIFICATION_ICON[col.classification]}
            </span>

          </div>
        ))}
      </div>
      <Handle type="target" position={Position.Left} style={hiddenHandle} />
      <Handle type="source" position={Position.Right} style={hiddenHandle} />
    </div>
  )
})

// ── EnumSchemaNode ────────────────────────────────────────────────────────────

const EnumSchemaNode = memo(function EnumSchemaNode({
  data,
  id,
}: NodeProps<EnumSchemaNodeData>) {
  const enumName = data.label?.trim() || id
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'

  const border = isDark ? 'var(--mantine-color-dark-4)' : 'var(--app-glass-border, #e0e0e0)'
  const headerBg = isDark ? 'var(--mantine-color-violet-9)' : 'var(--mantine-color-violet-1)'
  const rowBorder = isDark ? 'var(--mantine-color-dark-5)' : '#f0f0f0'
  const valueColor = isDark ? 'var(--mantine-color-dark-1)' : '#555'

  return (
    <div
      style={{
        minWidth: 180,
        border: `1px solid ${border}`,
        borderRadius: 8,
        backgroundColor: 'var(--mantine-color-body)',
        boxShadow: isDark ? '0 1px 4px rgba(0,0,0,.4)' : '0 1px 4px rgba(0,0,0,.08)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: headerBg,
          borderBottom: `1px solid ${border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--mantine-color-violet-5)', letterSpacing: 1 }}>
          ENUM
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'monospace',
            fontWeight: 600,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {enumName}
        </span>
      </div>
      <div style={{ padding: '4px 0' }}>
        {(Array.isArray(data.values) ? data.values : []).map((val) => (
          <div
            key={val}
            style={{
              padding: '4px 12px',
              borderBottom: `1px solid ${rowBorder}`,
              fontFamily: 'monospace',
              fontSize: 12,
              color: valueColor,
            }}
          >
            {val}
          </div>
        ))}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: 'none', width: 8, height: 8, minWidth: 0, minHeight: 0 }}
      />
    </div>
  )
})

// ── ELK layout ────────────────────────────────────────────────────────────────

const TABLE_WIDTH = 300
const HEADER_HEIGHT = 44
const ROW_HEIGHT = 30
const TABLE_MIN_HEIGHT = 80

const elk = new ELK()
const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': '50',
  'elk.padding': '[top=40,left=40,bottom=40,right=40]',
  'elk.separateConnectedComponents': 'true',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
}

function colSortKey(col: DbColumn): number {
  if (col.isPrimaryKey) return 0
  if (col.foreignKey) return 1
  return 2
}

function sortedColumns(cols: DbColumn[]): DbColumn[] {
  return [...cols].sort((a, b) => colSortKey(a) - colSortKey(b))
}

function tableHeight(cols: DbColumn[]): number {
  return Math.max(TABLE_MIN_HEIGHT, HEADER_HEIGHT + cols.length * ROW_HEIGHT)
}

const ENUM_NODE_WIDTH = 200
const ENUM_ROW_HEIGHT = 28

function enumNodeId(e: DbEnum): string {
  return e.schema === 'public' ? e.name : `${e.schema}.${e.name}`
}

function enumHeight(e: DbEnum): number {
  return Math.max(80, HEADER_HEIGHT + e.values.length * ENUM_ROW_HEIGHT)
}

async function schemaToFlow(schema: DbSchema): Promise<{
  nodes: Node[]
  edges: Edge[]
}> {
  const edges: Edge[] = []
  const edgeIds = new Set<string>()
  const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = []

  const tableNodeIds = new Set(schema.tables.map((t) => t.name))

  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.foreignKey) {
        const target = col.foreignKey.table
        if (!tableNodeIds.has(target)) continue
        const edgeId = `${table.name}.${col.name}->${target}`
        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId)
          edges.push({
            id: edgeId,
            source: table.name,
            target,
            label: col.name,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: 'var(--mantine-color-blue-5)', strokeWidth: 1.5 },
            labelStyle: { fontSize: 10, fill: 'var(--mantine-color-blue-5)' },
            labelBgStyle: { fill: 'transparent' },
          })
          elkEdges.push({
            id: edgeId,
            sources: [table.name],
            targets: [target],
          })
        }
      }
    }
  }

  const tableNodes: Node[] = schema.tables.map((table, i) => ({
    id: table.name,
    type: 'databaseSchema',
    position: { x: (i % 3) * 360, y: Math.floor(i / 3) * 320 },
    data: { label: table.name, columns: sortedColumns(table.columns) },
  }))

  try {
    const layout = await elk.layout({
      id: 'schema',
      layoutOptions: ELK_OPTIONS,
      children: [
        ...schema.tables.map((table) => ({
          id: table.name,
          width: TABLE_WIDTH,
          height: tableHeight(sortedColumns(table.columns)),
        })),
      ],
      edges: elkEdges,
    })

    const posById = new Map(
      (layout.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])
    )

    const nodes: Node[] = schema.tables.map((table, i) => ({
      id: table.name,
      type: 'databaseSchema',
      position: posById.get(table.name) ?? tableNodes[i]?.position ?? { x: 0, y: 0 },
      data: { label: table.name, columns: sortedColumns(table.columns) },
    }))

    return { nodes, edges }
  } catch (err) {
    console.error('[ELK layout error]', err)
    return { nodes: tableNodes, edges }
  }
}

// ── Node types ────────────────────────────────────────────────────────────────

const nodeTypes = { databaseSchema: DatabaseSchemaNode }

// ── Filter helpers ────────────────────────────────────────────────────────────

const INTERNAL_TABLE_PREFIXES = [
  'authjs_',
  'workflow_',
  'ai_',
  'pikku_',
]

const ALWAYS_SKIP = new Set(['migrations', 'sql_migrations', 'pgmigrations'])

function shouldShowTable(name: string, hideInternal: boolean): boolean {
  const bare = name.includes('.') ? name.split('.').pop()! : name
  if (ALWAYS_SKIP.has(bare)) return false
  if (!hideInternal) return true
  return !INTERNAL_TABLE_PREFIXES.some((prefix) => bare.startsWith(prefix))
}

// ── Canvas component ──────────────────────────────────────────────────────────

function DatabaseCanvas({
  schema,
  loading,
  onRefresh,
  refreshing,
  hideInternal,
  classificationFilter,
  search,
}: {
  schema: DbSchema | null | undefined
  loading: boolean
  onRefresh: () => void
  refreshing: boolean
  hideInternal: boolean
  classificationFilter: ClassificationFilter
  search: string
}) {
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [layouting, setLayouting] = useState(false)
  const flowRef = useRef<ReactFlowInstance | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!schema?.tables?.length) {
        setNodes([])
        setEdges([])
        return
      }

      const q = search.trim().toLowerCase()
      const filtered = schema.tables
        .filter((t) => {
          if (!shouldShowTable(t.name, hideInternal)) return false
          if (classificationFilter !== 'all' && !t.columns.some((col) => col.classification === classificationFilter)) return false
          if (q && !t.name.toLowerCase().includes(q) && !t.columns.some((col) => col.name.toLowerCase().includes(q))) return false
          return true
        })
        .map((t) => {
          const byClass = classificationFilter === 'all' ? t.columns : t.columns.filter((col) => col.classification === classificationFilter)
          const cols = q && !t.name.toLowerCase().includes(q) ? byClass.filter((col) => col.name.toLowerCase().includes(q)) : byClass
          return { ...t, columns: cols }
        })
      if (!filtered.length) {
        setNodes([])
        setEdges([])
        return
      }

      setLayouting(true)
      try {
        const flow = await schemaToFlow({ tables: filtered, enums: schema.enums ?? [] })
        if (cancelled) return
        setNodes(flow.nodes)
        setEdges(flow.edges)
        setTimeout(() => {
          if (!cancelled) flowRef.current?.fitView({ padding: 0.15, duration: 300, minZoom: 0.4 })
        }, 50)
      } catch {
        if (!cancelled) {
          setNodes([])
          setEdges([])
        }
      } finally {
        if (!cancelled) setLayouting(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [schema, hideInternal, classificationFilter, search, setEdges, setNodes])

  if (loading || (layouting && nodes.length === 0)) {
    return (
      <Center h="60vh">
        <Loader size="sm" />
      </Center>
    )
  }

  if (!schema) {
    return (
      <EmptyStatePlaceholder
        icon={DatabaseIcon}
        title="No database configured"
        description="Add a SQLite or Postgres database to your pikku project."
        docsHref="https://pikku.dev/docs/core-features/database"
      />
    )
  }

  if (nodes.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={DatabaseIcon}
        title={hideInternal ? 'No visible tables' : 'No tables found'}
        description={hideInternal ? 'All tables are hidden by the Pikku-internal filter.' : undefined}
        docsHref="https://pikku.dev/docs/core-features/database"
      />
    )
  }

  return (
    <Box className={classes.listSurfaceCard} style={{ flex: 1, minHeight: 0 }}>
      <ReactFlow
        onInit={(instance) => {
          flowRef.current = instance
        }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        style={{
          background: 'transparent',
          height: '100%',
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-4)'}
        />
        <Controls
          style={{
            '--xy-controls-button-background-color': isDark ? 'var(--mantine-color-dark-6)' : '#fff',
            '--xy-controls-button-background-color-hover': isDark ? 'var(--mantine-color-dark-5)' : '#f4f4f5',
            '--xy-controls-button-color': isDark ? 'var(--mantine-color-dark-0)' : '#333',
            '--xy-controls-button-border-color': isDark ? 'var(--mantine-color-dark-4)' : '#d1d5db',
          } as React.CSSProperties}
        />
        <MiniMap
          nodeColor={isDark ? 'var(--mantine-color-dark-3)' : '#ccc'}
          maskColor={isDark ? 'rgba(0,0,0,0.6)' : 'rgba(240,240,240,0.7)'}
          style={{
            background: isDark ? 'var(--mantine-color-dark-7)' : '#f8f9fa',
            border: `1px solid ${isDark ? 'var(--mantine-color-dark-4)' : '#e5e7eb'}`,
          }}
        />
      </ReactFlow>
    </Box>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────


// ── Page ──────────────────────────────────────────────────────────────────────

const DatabasePageLayout: React.FC<{ header: React.ReactNode; children: React.ReactNode }> = ({ header, children }) => {
  const { activePanel } = usePanelContext()
  return (
    <ResizablePanelLayout hidePanel={!activePanel} header={header}>
      {children}
    </ResizablePanelLayout>
  )
}

function DatabasePageInner() {
  const rpc = usePikkuRPC()
  const [hideInternal, setHideInternal] = useState(true)
  const [classificationFilter, setClassificationFilter] = useState<ClassificationFilter>('all')
  const [search, setSearch] = useState('')

  const { data: schema, isLoading, isFetching, error, refetch } = useQuery<
    DbSchema | null
  >({
    queryKey: ['console:getDbSchema'],
    queryFn: () => rpc.invoke('console:getDbSchema') as Promise<DbSchema | null>,
  })

  const header = (
    <ListPageHeader
      title="Database"
      description="Visual schema for your local development database."
      view={
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="xs"
            placeholder="Filter tables / columns…"
            leftSection={<Search size={12} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ width: 200 }}
          />
          <SegmentedControl
            size="xs"
            value={classificationFilter}
            onChange={(v) => setClassificationFilter(v as ClassificationFilter)}
            data={[
              { label: 'All', value: 'all' },
              { label: <Group gap={4} wrap="nowrap"><Globe size={14} color="var(--mantine-color-teal-5)" />Public</Group>, value: 'public' },
              { label: <Group gap={4} wrap="nowrap"><Shield size={14} color="var(--mantine-color-orange-5)" />Private</Group>, value: 'private' },
              { label: <Group gap={4} wrap="nowrap"><UserCheck size={14} color="var(--mantine-color-violet-5)" />PII</Group>, value: 'pii' },
              { label: <Group gap={4} wrap="nowrap"><LockKeyhole size={14} color="var(--mantine-color-red-5)" />Secret</Group>, value: 'secret' },
            ]}
          />
          <PikkuToggle
            checked={!hideInternal}
            onChange={(v) => setHideInternal(!v)}
            tooltip="Show Pikku internal tables"
          />
          <Tooltip label="Refresh">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              loading={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      }
    />
  )

  return (
    <PanelProvider>
      <DatabasePageLayout header={header}>
        <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {error ? (
            <EmptyStatePlaceholder
              icon={DatabaseIcon}
              title="See your tables and data privacy here"
              description="Run pikku db migrate to visualise your schema with column-level privacy classifications."
              code="pikku db migrate"
              docsHref="https://pikku.dev/docs/core-features/database"
            />
          ) : (
            <DatabaseCanvas
              schema={schema}
              loading={isLoading}
              onRefresh={() => void refetch()}
              refreshing={isFetching}
              hideInternal={hideInternal}
              classificationFilter={classificationFilter}
              search={search}
            />
          )}
        </Box>
      </DatabasePageLayout>
    </PanelProvider>
  )
}

export function DatabasePage() {
  return (
    <ReactFlowProvider>
      <DatabasePageInner />
    </ReactFlowProvider>
  )
}
