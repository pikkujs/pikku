import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  Box,
  Text,
  Stack,
  Group,
  Badge,
  Loader,
  Center,
  Tabs,
  TextInput,
  ActionIcon,
  Button,
  ScrollArea,
  Code,
} from '@mantine/core'
import { GitCompare, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import {
  useStateDiff,
  type DiffEntry,
  type StateDiff,
} from '../hooks/useStateDiff'
import { httpMethodDefs, funcWrapperDefs } from '../components/ui/badge-defs'
import classes from '../components/ui/console.module.css'

const CATEGORY_LABELS: Record<string, string> = {
  functions: 'Functions',
  http: 'HTTP',
  scheduler: 'Schedulers',
  queue: 'Queues',
  channel: 'Channels',
  trigger: 'Triggers',
  mcp: 'MCP',
  agent: 'Agents',
  cli: 'CLI',
  middleware: 'Middleware',
  variables: 'Variables',
  secrets: 'Secrets',
}

const STATUS_COLOR: Record<string, string> = {
  added: 'green',
  removed: 'red',
  modified: 'yellow',
  unchanged: 'gray',
}

const STATUS_GLYPH: Record<string, string> = {
  added: '+',
  removed: '−',
  modified: '~',
  unchanged: '·',
}

const STORAGE_KEY = 'pikku-changes-base-path'

const StatusPill: React.FC<{ status: DiffEntry['status'] }> = ({ status }) => {
  return (
    <Badge
      size="sm"
      color={STATUS_COLOR[status]}
      variant="light"
      style={{ fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}
    >
      {STATUS_GLYPH[status]}
    </Badge>
  )
}

const HttpMethodBadge: React.FC<{ method: string }> = ({ method }) => {
  const def = httpMethodDefs[method.toUpperCase()] ?? {
    color: 'gray',
    label: method.toUpperCase(),
  }
  return (
    <Badge
      size="sm"
      color={def.color}
      variant="light"
      style={{ fontFamily: 'monospace', minWidth: 44, textAlign: 'center' }}
    >
      {def.label}
    </Badge>
  )
}

const FuncWrapperBadge: React.FC<{ wrapper?: string }> = ({ wrapper }) => {
  if (!wrapper) return null
  const def = funcWrapperDefs[wrapper] ?? { color: 'gray', label: wrapper }
  return (
    <Badge size="sm" color={def.color} variant="outline">
      {def.label}
    </Badge>
  )
}

const PrimaryRow: React.FC<{
  entry: DiffEntry
  category: string
}> = ({ entry, category }) => {
  const data = (entry.ours ?? entry.base ?? {}) as Record<string, unknown>

  if (category === 'http') {
    const [method, ...routeParts] = entry.id.split(':')
    const route = routeParts.join(':')
    const funcId = String(data.pikkuFuncId ?? '')
    const params = Array.isArray(data.params) ? (data.params as string[]) : []
    return (
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <HttpMethodBadge method={method} />
        <Text
          size="sm"
          c="var(--app-meta-value)"
          ff="monospace"
          style={{ flex: 1, minWidth: 0 }}
          truncate
        >
          {route}
        </Text>
        {params.length > 0 && (
          <Text size="sm" c="dimmed" ff="monospace">
            params: {params.join(', ')}
          </Text>
        )}
        {funcId && (
          <Text
            size="sm"
            c="dimmed"
            ff="monospace"
            truncate
            style={{ maxWidth: 240 }}
          >
            → {funcId}
          </Text>
        )}
      </Group>
    )
  }

  if (category === 'functions') {
    const wrapper = String(data.funcWrapper ?? '')
    const inSchema = data.inputSchemaName ? String(data.inputSchemaName) : null
    const outSchema = data.outputSchemaName
      ? String(data.outputSchemaName)
      : null
    const sessionless = data.sessionless === true
    return (
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Text
          size="sm"
          c="var(--app-meta-value)"
          ff="monospace"
          fw={500}
          style={{ minWidth: 0 }}
          truncate
        >
          {entry.id}
        </Text>
        <FuncWrapperBadge wrapper={wrapper} />
        {sessionless && (
          <Badge size="sm" color="gray" variant="light">
            sessionless
          </Badge>
        )}
        {(inSchema || outSchema) && (
          <Text
            size="sm"
            c="dimmed"
            ff="monospace"
            truncate
            style={{ flex: 1, minWidth: 0 }}
          >
            {inSchema ?? '·'} → {outSchema ?? 'void'}
          </Text>
        )}
      </Group>
    )
  }

  const route = data.route ? String(data.route) : null
  const queueName = data.queueName ? String(data.queueName) : null
  const cronValue = data.cron ?? data.schedule
  const cron = typeof cronValue === 'string' ? cronValue : null
  return (
    <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
      <Text
        size="sm"
        c="var(--app-meta-value)"
        ff="monospace"
        fw={500}
        style={{ minWidth: 0 }}
        truncate
      >
        {entry.id}
      </Text>
      {route && (
        <Text size="sm" c="dimmed" ff="monospace">
          {route}
        </Text>
      )}
      {queueName && (
        <Text size="sm" c="dimmed" ff="monospace">
          queue: {queueName}
        </Text>
      )}
      {cron && (
        <Text size="sm" c="dimmed" ff="monospace">
          cron: {cron}
        </Text>
      )}
    </Group>
  )
}

const FieldDiff: React.FC<{
  ours?: Record<string, unknown>
  base?: Record<string, unknown>
}> = ({ ours, base }) => {
  const allKeys = Array.from(
    new Set([...Object.keys(ours ?? {}), ...Object.keys(base ?? {})])
  ).sort()

  return (
    <Box
      style={{
        borderRadius: 4,
        border: '1px solid var(--app-row-border)',
        background: 'var(--app-surface, var(--mantine-color-body))',
        overflow: 'hidden',
      }}
    >
      <Group
        gap={0}
        style={{
          borderBottom: '1px solid var(--app-row-border)',
          background: 'var(--mantine-color-default-hover)',
        }}
      >
        <Text
          size="sm"
          c="dimmed"
          fw={600}
          tt="uppercase"
          style={{ width: 180, padding: '6px 12px' }}
        >
          field
        </Text>
        <Text
          size="sm"
          c="dimmed"
          fw={600}
          tt="uppercase"
          style={{
            flex: 1,
            padding: '6px 12px',
            borderLeft: '1px solid var(--app-row-border)',
          }}
        >
          base
        </Text>
        <Text
          size="sm"
          c="dimmed"
          fw={600}
          tt="uppercase"
          style={{
            flex: 1,
            padding: '6px 12px',
            borderLeft: '1px solid var(--app-row-border)',
          }}
        >
          ours
        </Text>
      </Group>
      {allKeys.map((key) => {
        const o = ours?.[key]
        const b = base?.[key]
        const equal = JSON.stringify(o) === JSON.stringify(b)
        return (
          <Group
            key={key}
            gap={0}
            wrap="nowrap"
            style={{
              borderBottom: '1px solid var(--app-row-border)',
              background: equal ? 'transparent' : 'var(--mantine-color-default-hover)',
            }}
          >
            <Text
              size="sm"
              c={equal ? 'dimmed' : 'yellow'}
              ff="monospace"
              style={{ width: 180, padding: '6px 12px' }}
            >
              {key}
            </Text>
            <Box
              style={{
                flex: 1,
                padding: '6px 12px',
                borderLeft: '1px solid var(--app-row-border)',
                background:
                  !equal && b !== undefined
                    ? 'rgba(255, 80, 80, 0.06)'
                    : undefined,
              }}
            >
              <Code
                style={{
                  background: 'transparent',
                  fontSize: 11,
                  color: b === undefined ? 'var(--mantine-color-dimmed)' : undefined,
                }}
              >
                {b === undefined ? '—' : JSON.stringify(b)}
              </Code>
            </Box>
            <Box
              style={{
                flex: 1,
                padding: '6px 12px',
                borderLeft: '1px solid var(--app-row-border)',
                background:
                  !equal && o !== undefined
                    ? 'rgba(80, 200, 120, 0.06)'
                    : undefined,
              }}
            >
              <Code
                style={{
                  background: 'transparent',
                  fontSize: 11,
                  color: o === undefined ? 'var(--mantine-color-dimmed)' : undefined,
                }}
              >
                {o === undefined ? '—' : JSON.stringify(o)}
              </Code>
            </Box>
          </Group>
        )
      })}
    </Box>
  )
}

const EntryCard: React.FC<{ entry: DiffEntry; category: string }> = ({
  entry,
  category,
}) => {
  const [expanded, setExpanded] = useState(entry.status === 'modified')
  return (
    <Box
      style={{
        borderBottom: '1px solid var(--app-row-border)',
      }}
    >
      <Group
        gap="sm"
        wrap="nowrap"
        px="md"
        py="xs"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Box style={{ width: 14 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Box>
        <StatusPill status={entry.status} />
        <PrimaryRow entry={entry} category={category} />
      </Group>
      {expanded && (
        <Box px="lg" pb="md" pt={4}>
          <FieldDiff ours={entry.ours} base={entry.base} />
        </Box>
      )}
    </Box>
  )
}

const CategoryPanel: React.FC<{
  entries: DiffEntry[]
  category: string
}> = ({ entries, category }) => {
  const visible = entries.filter((e) => e.status !== 'unchanged')
  if (visible.length === 0) {
    return (
      <Center p="xl">
        <Text size="sm" c="dimmed">
          No changes in this category.
        </Text>
      </Center>
    )
  }
  return (
    <Stack gap={0}>
      {visible.map((entry) => (
        <EntryCard key={entry.id} entry={entry} category={category} />
      ))}
    </Stack>
  )
}

const DiffSummaryBar: React.FC<{ diff: StateDiff }> = ({ diff }) => {
  const totals = Object.values(diff.summary).reduce(
    (acc, s) => {
      acc.added += s.added
      acc.modified += s.modified
      acc.removed += s.removed
      return acc
    },
    { added: 0, modified: 0, removed: 0 }
  )
  const totalChanges = totals.added + totals.modified + totals.removed
  return (
    <Group
      gap="md"
      px="md"
      py={6}
      style={{
        borderBottom: '1px solid var(--app-row-border)',
        background: 'var(--app-surface, var(--mantine-color-body))',
      }}
    >
      <Text size="sm" c="dimmed">
        {totalChanges} change{totalChanges === 1 ? '' : 's'}
      </Text>
      {totals.added > 0 && (
        <Group gap={4}>
          <StatusPill status="added" />
          <Text size="sm" c="green.4">
            {totals.added} added
          </Text>
        </Group>
      )}
      {totals.modified > 0 && (
        <Group gap={4}>
          <StatusPill status="modified" />
          <Text size="sm" c="yellow.4">
            {totals.modified} modified
          </Text>
        </Group>
      )}
      {totals.removed > 0 && (
        <Group gap={4}>
          <StatusPill status="removed" />
          <Text size="sm" c="red.4">
            {totals.removed} removed
          </Text>
        </Group>
      )}
      <Box style={{ flex: 1 }} />
      <Text
        size="sm"
        c="dimmed"
        ff="monospace"
        truncate
        style={{ maxWidth: 380 }}
      >
        base: {diff.basePath.split('/').slice(-3).join('/')}
      </Text>
    </Group>
  )
}

const DiffView: React.FC<{ diff: StateDiff }> = ({ diff }) => {
  const tabs = useMemo(() => {
    return Object.entries(diff.categories)
      .map(([key, cat]) => ({
        key,
        label: CATEGORY_LABELS[key] ?? key,
        added: cat.added,
        removed: cat.removed,
        modified: cat.modified,
        entries: cat.entries,
      }))
      .filter((t) => t.added + t.removed + t.modified > 0)
  }, [diff])

  const [activeTab, setActiveTab] = useState<string | null>(
    tabs[0]?.key ?? null
  )

  useEffect(() => {
    if (!activeTab && tabs[0]) setActiveTab(tabs[0].key)
  }, [tabs, activeTab])

  if (tabs.length === 0) {
    return (
      <Center p="xl">
        <Text size="sm" c="dimmed">
          No changes between ours and base.
        </Text>
      </Center>
    )
  }

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      <DiffSummaryBar diff={diff} />
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        keepMounted={false}
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <Tabs.List px="md" pt="sm" style={{ flexShrink: 0 }}>
          {tabs.map((t) => (
            <Tabs.Tab key={t.key} value={t.key}>
              <Group gap={4}>
                <Text size="sm">{t.label}</Text>
                {t.added > 0 && (
                  <Badge size="sm" color="green" variant="light">
                    +{t.added}
                  </Badge>
                )}
                {t.modified > 0 && (
                  <Badge size="sm" color="yellow" variant="light">
                    ~{t.modified}
                  </Badge>
                )}
                {t.removed > 0 && (
                  <Badge size="sm" color="red" variant="light">
                    −{t.removed}
                  </Badge>
                )}
              </Group>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Box style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea h="100%">
            {tabs.map((t) => (
              <Tabs.Panel key={t.key} value={t.key}>
                <CategoryPanel entries={t.entries} category={t.key} />
              </Tabs.Panel>
            ))}
          </ScrollArea>
        </Box>
      </Tabs>
    </Box>
  )
}

export const ChangesPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const queryBase = searchParams.get('base')
  const queryOurs = searchParams.get('ours')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [draftPath, setDraftPath] = useState<string>(
    () => queryBase ?? localStorage.getItem(STORAGE_KEY) ?? ''
  )
  const [activePath, setActivePath] = useState<string | null>(
    () => queryBase ?? localStorage.getItem(STORAGE_KEY)
  )

  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('webkitdirectory', '')
    }
  }, [])

  useEffect(() => {
    if (queryBase && queryBase !== activePath) {
      setDraftPath(queryBase)
      setActivePath(queryBase)
    }
  }, [queryBase])

  const { data: diff, isLoading, error } = useStateDiff(activePath, queryOurs)

  const apply = () => {
    const trimmed = draftPath.trim()
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed)
      setActivePath(trimmed)
    } else {
      localStorage.removeItem(STORAGE_KEY)
      setActivePath(null)
    }
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const path = (file as any).path as string | undefined
    if (path) {
      const dir = path.split('/').slice(0, -1).join('/')
      setDraftPath(dir)
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        hidePanel
        header={
          <ListPageHeader
            title="Changes"
            description="Compare the current project state against a base .pikku snapshot"
            lead={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder="../worktree-to-compare/.pikku"
                  value={draftPath}
                  onChange={(e) => setDraftPath(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && apply()}
                  rightSection={
                    <ActionIcon variant="subtle" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <FolderOpen size={14} />
                    </ActionIcon>
                  }
                  size="xs"
                  style={{ width: 360 }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleFolderSelect}
                />
                <Button
                  size="xs"
                  leftSection={<GitCompare size={14} />}
                  onClick={apply}
                  disabled={draftPath.trim() === (activePath ?? '')}
                >
                  Compare
                </Button>
              </Group>
            }
          />
        }
      >
        <Box
          className={classes.listSurfaceCard}
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          {!activePath && (
            <EmptyStatePlaceholder
              icon={GitCompare}
              title="No base path set"
              description="Enter a path to a .pikku directory above to diff against."
              docsHref="https://pikku.dev/docs"
            />
          )}
          {activePath && isLoading && (
            <Center p="xl">
              <Loader />
            </Center>
          )}
          {activePath && error && (
            <Center p="xl">
              <Text size="sm" c="red">
                {(error as Error).message}
              </Text>
            </Center>
          )}
          {activePath && diff && !diff.baseExists && (
            <Center p="xl">
              <Text size="sm" c="red">
                Base path does not exist: <Code>{diff.basePath}</Code>
              </Text>
            </Center>
          )}
          {activePath && diff && diff.baseExists && <DiffView diff={diff} />}
        </Box>
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
