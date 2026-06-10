import { useState, useEffect, useRef, memo } from 'react'
import { Box, Center, Button, Loader, Text, Group, useMantineColorScheme } from '@mantine/core'
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
} from 'reactflow'
import type { NodeProps, Node, Edge, ReactFlowInstance } from 'reactflow'
import { useQuery } from '@tanstack/react-query'
import ELK from 'elkjs/lib/elk.bundled.js'
import { Database as DatabaseIcon, Table2, Key, Link, RefreshCw } from 'lucide-react'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { ListPageHeader } from '../components/layout/PageLayout'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import 'reactflow/dist/style.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type Classification = 'public' | 'private' | 'secret'

interface DbColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  classification: Classification
  foreignKey?: { table: string; column: string }
}

interface DbTable {
  name: string
  columns: DbColumn[]
}

interface DbSchema {
  tables: DbTable[]
}

interface DatabaseSchemaNodeData {
  label: string
  columns: DbColumn[]
}

// ── Classification colors ─────────────────────────────────────────────────────

const CLASSIFICATION_COLOR: Record<Classification, string> = {
  public: 'var(--mantine-color-teal-6)',
  private: 'var(--mantine-color-orange-5)',
  secret: 'var(--mantine-color-red-5)',
}

// ── DatabaseSchemaNode ────────────────────────────────────────────────────────

const DatabaseSchemaNode = memo(function DatabaseSchemaNode({
  data,
  id,
}: NodeProps<DatabaseSchemaNodeData>) {
  const tableName = data.label?.trim() || id
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'

  const border = isDark ? 'var(--mantine-color-dark-4)' : 'var(--app-glass-border, #e0e0e0)'
  const headerBg = isDark ? 'var(--mantine-color-dark-5)' : 'var(--mantine-color-blue-0, #e7f5ff)'
  const badgeBg = isDark ? 'var(--mantine-color-dark-4)' : '#f0f0f0'
  const badgeColor = isDark ? 'var(--mantine-color-dark-1)' : '#888'
  const rowBorder = isDark ? 'var(--mantine-color-dark-5)' : '#f0f0f0'
  const typeBg = isDark ? 'var(--mantine-color-dark-4)' : '#f5f5f5'
  const typeColor = isDark ? 'var(--mantine-color-dark-1)' : '#888'
  const handleDefault = isDark ? '#555' : '#ccc'
  const nullableColor = isDark ? 'var(--mantine-color-dark-2)' : '#aaa'

  return (
    <div
      style={{
        minWidth: 260,
        border: `1px solid ${border}`,
        borderRadius: 8,
        overflow: 'hidden',
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
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderBottom: `1px solid ${rowBorder}`,
              borderLeft: `3px solid ${CLASSIFICATION_COLOR[col.classification]}`,
            }}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={`${id}-${col.name}-target`}
              style={{
                width: 8,
                height: 8,
                background: col.foreignKey
                  ? 'var(--mantine-color-blue-5)'
                  : handleDefault,
                border: 'none',
                left: -4,
              }}
            />

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

            <Handle
              type="source"
              position={Position.Right}
              id={`${id}-${col.name}-source`}
              style={{
                width: 8,
                height: 8,
                background: col.foreignKey
                  ? 'var(--mantine-color-blue-5)'
                  : handleDefault,
                border: 'none',
                right: -4,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
})

// ── ELK layout ────────────────────────────────────────────────────────────────

const TABLE_WIDTH = 300
const HEADER_HEIGHT = 44
const ROW_HEIGHT = 34
const TABLE_MIN_HEIGHT = 120

const elk = new ELK()
const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '200',
  'elk.spacing.nodeNode': '120',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.padding': '[top=40,left=40,bottom=40,right=40]',
}

function tableHeight(cols: DbColumn[]): number {
  return Math.max(TABLE_MIN_HEIGHT, HEADER_HEIGHT + cols.length * ROW_HEIGHT)
}

async function schemaToFlow(schema: DbSchema): Promise<{
  nodes: Node<DatabaseSchemaNodeData>[]
  edges: Edge[]
}> {
  const edges: Edge[] = []
  const edgeIds = new Set<string>()
  const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = []

  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.foreignKey) {
        const edgeId = `${table.name}.${col.name}->${col.foreignKey.table}`
        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId)
          edges.push({
            id: edgeId,
            source: table.name,
            sourceHandle: `${table.name}-${col.name}-source`,
            target: col.foreignKey.table,
            targetHandle: `${col.foreignKey.table}-${col.foreignKey.column}-target`,
            label: col.name,
            type: 'smoothstep',
            animated: true,
          })
          elkEdges.push({
            id: edgeId,
            sources: [table.name],
            targets: [col.foreignKey.table],
          })
        }
      }
    }
  }

  const fallback: Node<DatabaseSchemaNodeData>[] = schema.tables.map(
    (table, i) => ({
      id: table.name,
      type: 'databaseSchema',
      position: { x: (i % 3) * 360, y: Math.floor(i / 3) * 320 },
      data: { label: table.name, columns: table.columns },
    })
  )

  try {
    const layout = await elk.layout({
      id: 'schema',
      layoutOptions: ELK_OPTIONS,
      children: schema.tables.map((table) => ({
        id: table.name,
        width: TABLE_WIDTH,
        height: tableHeight(table.columns),
      })),
      edges: elkEdges,
    })

    const posById = new Map(
      (layout.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])
    )

    const nodes: Node<DatabaseSchemaNodeData>[] = schema.tables.map((table, i) => ({
      id: table.name,
      type: 'databaseSchema',
      position:
        posById.get(table.name) ?? fallback[i]?.position ?? { x: 0, y: 0 },
      data: { label: table.name, columns: table.columns },
    }))

    return { nodes, edges }
  } catch {
    return { nodes: fallback, edges }
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
  if (ALWAYS_SKIP.has(name)) return false
  if (!hideInternal) return true
  return !INTERNAL_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix))
}

// ── Canvas component ──────────────────────────────────────────────────────────

function DatabaseCanvas({
  schema,
  loading,
  onRefresh,
  refreshing,
  hideInternal,
}: {
  schema: DbSchema | null | undefined
  loading: boolean
  onRefresh: () => void
  refreshing: boolean
  hideInternal: boolean
}) {
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'
  const [nodes, setNodes, onNodesChange] = useNodesState<DatabaseSchemaNodeData>([])
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

      const filtered = schema.tables.filter((t) =>
        shouldShowTable(t.name, hideInternal)
      )
      if (!filtered.length) {
        setNodes([])
        setEdges([])
        return
      }

      setLayouting(true)
      try {
        const flow = await schemaToFlow({ tables: filtered })
        if (cancelled) return
        setNodes(flow.nodes)
        setEdges(flow.edges)
        requestAnimationFrame(() =>
          flowRef.current?.fitView({ padding: 0.12, duration: 220 })
        )
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
  }, [schema, hideInternal, setEdges, setNodes])

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
    <Box style={{ flex: 1, minHeight: 0 }}>
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
        style={{
          background: isDark ? 'var(--mantine-color-dark-8)' : 'var(--mantine-color-gray-0, #f8f9fa)',
          height: '100%',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap nodeColor="#aaa" />
      </ReactFlow>
    </Box>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function ClassificationLegend() {
  return (
    <Group gap="md">
      {(
        [
          { label: 'public', color: CLASSIFICATION_COLOR.public },
          { label: 'private', color: CLASSIFICATION_COLOR.private },
          { label: 'secret', color: CLASSIFICATION_COLOR.secret },
        ] as const
      ).map(({ label, color }) => (
        <Group key={label} gap={4} align="center">
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: color,
              flexShrink: 0,
            }}
          />
          <Text size="xs" c="dimmed">
            {label}
          </Text>
        </Group>
      ))}
    </Group>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function DatabasePageInner() {
  const rpc = usePikkuRPC()
  const [hideInternal, setHideInternal] = useState(true)

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
      filters={
        <Group gap="sm">
          <ClassificationLegend />
          <Button
            size="xs"
            variant={hideInternal ? 'light' : 'subtle'}
            onClick={() => setHideInternal((v) => !v)}
          >
            Hide internal tables
          </Button>
        </Group>
      }
      view={
        <Button
          size="xs"
          variant="subtle"
          leftSection={<RefreshCw size={13} />}
          loading={isFetching}
          onClick={() => void refetch()}
        >
          Refresh
        </Button>
      }
    />
  )

  return (
    <PanelProvider>
      <ResizablePanelLayout hidePanel header={header}>
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
            />
          )}
        </Box>
      </ResizablePanelLayout>
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
