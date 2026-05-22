import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  ScrollArea,
  UnstyledButton,
  Group,
  Badge,
  Center,
  Loader,
  ActionIcon,
  Collapse,
} from '@mantine/core'
import { ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider } from '../context/PanelContext'
import { usePanelContext } from '../context/PanelContext'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { useFunctionMeta } from '../hooks/useWirings'
import { X } from 'lucide-react'
import { SchemaSection } from '../components/project/panels/shared/SchemaSection'
import { funcWrapperDefs } from '../components/ui/badge-defs'
import { MetaRow } from '../components/ui/MetaRow'
import { SectionLabel } from '../components/ui/SectionLabel'
import { ListDetailLayout } from '../components/ui/ListDetailLayout'
import { GridHeader } from '../components/ui/GridHeader'
import { ListItem } from '../components/ui/ListItem'
import { SearchInput } from '../components/ui/SearchInput'
import { TagBadge, ServiceBadge } from '../components/ui/TagBadge'
import classes from '../components/ui/console.module.css'

export interface FunctionExtraColumn {
  label: string
  width: string
  align?: 'right'
  render: (funcId: string) => React.ReactNode
}

const BASE_GRID_COLUMNS = '240px 140px 60px 100px 80px'

const CollapsibleSchema: React.FC<{
  label: string
  schemaName?: string | null
}> = ({ label, schemaName }) => {
  const [open, setOpen] = useState(false)
  if (!schemaName) return null

  return (
    <Box>
      <UnstyledButton
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 0 6px',
          width: '100%',
        }}
      >
        <Text size="sm" c="var(--app-section-label)" style={{ fontSize: 9 }}>
          {open ? '▾' : '▸'}
        </Text>
        <Text
          size="sm"
          fw={600}
          ff="monospace"
          c="var(--app-section-label)"
          tt="uppercase"
          className={classes.gridHeaderLabel}
        >
          {label}
        </Text>
        <Text size="sm" ff="monospace" c="var(--app-text-muted)">
          {schemaName}
        </Text>
      </UnstyledButton>
      {open && <SchemaSection schemaName={schemaName} />}
    </Box>
  )
}

const FunctionDetail: React.FC<{ func: any; onClose: () => void }> = ({ func, onClose }) => {
  const funcId = func.pikkuFuncName || func.pikkuFuncId
  const { functionUsedBy } = usePikkuMeta()
  const usedBy = functionUsedBy.get(funcId)
  const allWirings = usedBy ? [...usedBy.transports, ...usedBy.jobs] : []
  const inputSchemaName = func.inputSchemaName
  const outputSchemaName = func.outputSchemaName

  return (
    <Box className={classes.flexColumn} style={{ overflow: 'auto' }}>
      <Box className={classes.detailHeader}>
        <Box className={classes.flexGrow}>
          <Text size="sm" fw={600} ff="monospace" c="var(--app-meta-value)" mb={4}>
            {funcId}
          </Text>
          {(func.summary || func.description) && (
            <Text size="sm" c="var(--app-text-muted)" lh={1.5}>
              {func.summary || func.description}
            </Text>
          )}
        </Box>
        {funcWrapperDefs[func.funcWrapper] && (
          <Badge size="sm" variant="light" color="gray">
            {funcWrapperDefs[func.funcWrapper].label}
          </Badge>
        )}
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose}>
          <X size={14} />
        </ActionIcon>
      </Box>
      <Box p="md" className={classes.flexGrow}>
        <SectionLabel>Metadata</SectionLabel>

        {func.exportedName && (
          <MetaRow label="export" labelWidth={90}>
            <Text size="sm" ff="monospace" c="var(--app-meta-value)">
              {func.exportedName}
            </Text>
          </MetaRow>
        )}

        {func.sourceFile && (
          <MetaRow label="source" labelWidth={90}>
            <Text size="sm" ff="monospace" c="var(--app-text)" truncate>
              {func.sourceFile.replace(/^.*\/src\//, 'src/')}
            </Text>
          </MetaRow>
        )}

        <MetaRow label="sessionless" labelWidth={90}>
          <Text size="sm" ff="monospace" c={func.sessionless ? '#86efac' : 'var(--app-text-muted)'}>
            {func.sessionless ? 'true' : 'false'}
          </Text>
        </MetaRow>

        <MetaRow label="version" labelWidth={90}>
          {func.version ? (
            <Group gap={6}>
              <Text size="sm" ff="monospace" c="var(--app-meta-value)">
                v{func.version}
              </Text>
              {func.contractHash && (
                <Text size="sm" ff="monospace" c="var(--app-text-muted)">
                  ({func.contractHash})
                </Text>
              )}
            </Group>
          ) : (
            <Text size="sm" ff="monospace" c="var(--app-text-muted)">
              not enabled
            </Text>
          )}
        </MetaRow>

        <MetaRow label="services" labelWidth={90}>
          {func.services?.services?.length > 0 ? (
            <Group gap={5}>
              {func.services.services.map((svc: string) => (
                <ServiceBadge key={svc}>{svc}</ServiceBadge>
              ))}
            </Group>
          ) : (
            <Text size="sm" ff="monospace" c="var(--app-text-muted)">—</Text>
          )}
        </MetaRow>

        <MetaRow label="tags" labelWidth={90}>
          {func.tags?.length > 0 ? (
            <Group gap={4}>
              {func.tags.map((tag: string, i: number) => (
                <TagBadge key={i}>{tag}</TagBadge>
              ))}
            </Group>
          ) : (
            <Text size="sm" ff="monospace" c="var(--app-text-muted)">—</Text>
          )}
        </MetaRow>

        <MetaRow label="middleware" labelWidth={90}>
          {func.middleware?.length > 0 ? (
            <Group gap={4}>
              {func.middleware.map((mw: any, i: number) => (
                <Badge key={i} size="sm" variant="light" color="gray">
                  {typeof mw === 'string' ? mw : mw.type || 'middleware'}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" ff="monospace" c="var(--app-text-muted)">—</Text>
          )}
        </MetaRow>

        <MetaRow label="permissions" labelWidth={90}>
          {func.permissions?.length > 0 ? (
            <Group gap={4}>
              {func.permissions.map((p: any, i: number) => (
                <Badge key={i} size="sm" variant="light" color="yellow">
                  {typeof p === 'string' ? p : p.name || 'permission'}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" ff="monospace" c="var(--app-text-muted)">—</Text>
          )}
        </MetaRow>

        {allWirings.length > 0 && (
          <>
            <SectionLabel>Wired To ({allWirings.length})</SectionLabel>
            {allWirings.map((w: any) => (
              <MetaRow key={w.id} label={w.type} labelWidth={90}>
                <Text size="sm" ff="monospace" c="var(--app-service-color)">
                  {w.name}
                </Text>
              </MetaRow>
            ))}
          </>
        )}

        {(inputSchemaName || outputSchemaName) && <SectionLabel>Schemas</SectionLabel>}
        <CollapsibleSchema label="Input" schemaName={inputSchemaName} />
        <CollapsibleSchema label="Output" schemaName={outputSchemaName} />
      </Box>
    </Box>
  )
}

const FunctionsPageInner: React.FC<{
  functions: any[]
  extraColumns?: FunctionExtraColumn[]
  headerRight?: React.ReactNode
}> = ({ functions, extraColumns = [], headerRight }) => {
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { functionUsedBy } = usePikkuMeta()
  const GRID_COLUMNS = [BASE_GRID_COLUMNS, ...extraColumns.map((c) => c.width)].join(' ')

  const filtered = useMemo(() => {
    const userFuncs = functions.filter((func: any) => {
      const id = func.pikkuFuncId
      return (
        (!func.functionType || func.functionType === 'user') &&
        !id?.startsWith('pikku')
      )
    })
    if (!search) return userFuncs
    const q = search.toLowerCase()
    return userFuncs.filter(
      (func: any) =>
        func.pikkuFuncId?.toLowerCase().includes(q) ||
        func.summary?.toLowerCase().includes(q) ||
        func.description?.toLowerCase().includes(q)
    )
  }, [functions, search])

  const selectedFunc = useMemo(() => {
    if (!selected) return null
    return functions.find(
      (f: any) => (f.pikkuFuncName || f.pikkuFuncId) === selected
    ) || null
  }, [functions, selected])

  const list = (
    <>
      <Group gap="xs" align="center" style={{ paddingRight: 8 }}>
        <Box style={{ flex: 1 }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search functions..."
          />
        </Box>
        {headerRight}
      </Group>
      <GridHeader
        columns={[
          { label: 'Name' },
          { label: 'Type' },
          { label: 'Auth' },
          { label: 'Permissions' },
          { label: 'Wirings' },
          ...extraColumns.map((c) => ({ label: c.label, align: c.align })),
        ]}
        gridTemplateColumns={GRID_COLUMNS}
      />
      <ScrollArea className={classes.flexGrow}>
        {filtered.map((func: any) => {
          const funcId = func.pikkuFuncName || func.pikkuFuncId
          const isActive = selected === funcId
          const usedBy = functionUsedBy.get(funcId)
          const wiringCount = usedBy
            ? usedBy.transports.length + usedBy.jobs.length
            : 0
          const wrapperDef = funcWrapperDefs[func.funcWrapper]
          const hasAuth = func.sessionless !== true
          const versions: any[] = func.versions ?? []
          const hasVersions = versions.length > 1
          const isExpanded = expanded.has(funcId)

          const toggleExpand = (e: React.MouseEvent) => {
            e.stopPropagation()
            setExpanded((prev) => {
              const next = new Set(prev)
              next.has(funcId) ? next.delete(funcId) : next.add(funcId)
              return next
            })
          }

          return (
            <Box key={funcId}>
              <ListItem
                active={isActive}
                onClick={() => setSelected(funcId)}
                gridTemplateColumns={GRID_COLUMNS}
                padding="9px 16px"
              >
                <Group gap={4} wrap="nowrap">
                  {hasVersions ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size={16}
                      onClick={toggleExpand}
                      style={{ flexShrink: 0, transition: 'transform 150ms', transform: isExpanded ? 'rotate(90deg)' : 'none' }}
                    >
                      <ChevronRight size={12} />
                    </ActionIcon>
                  ) : (
                    <Box w={16} style={{ flexShrink: 0 }} />
                  )}
                  <Box style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" ff="monospace" c={isActive ? 'var(--app-meta-value)' : 'var(--app-text)'} truncate>
                        {funcId}
                      </Text>
                      {func.version != null && (
                        <Badge size="xs" variant="outline" color="gray" ff="monospace" style={{ flexShrink: 0 }}>
                          v{func.version}
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" ff="monospace" c="var(--app-text-muted)" truncate style={{ fontSize: 9, maxWidth: 280, opacity: func.summary || func.description ? 1 : 0.4 }}>
                      {func.summary || func.description || 'No description'}
                    </Text>
                  </Box>
                </Group>
                {wrapperDef ? (
                  <Badge size="sm" variant="light" color="gray" tt="none">
                    {wrapperDef.label}
                  </Badge>
                ) : <Box />}
                <Text size="sm" ff="monospace" c={hasAuth ? '#86efac' : 'var(--app-text-muted)'}>
                  {hasAuth ? 'Auth' : '—'}
                </Text>
                <Text size="sm" ff="monospace" c="var(--app-text-muted)" truncate>
                  {func.permissions?.length > 0
                    ? func.permissions.map((p: any) => p.name || p).join(', ')
                    : '—'}
                </Text>
                <Text size="sm" ff="monospace" c={wiringCount > 0 ? 'var(--app-service-color)' : 'var(--app-text-muted)'}>
                  {wiringCount > 0 ? `${wiringCount} ${wiringCount === 1 ? 'wiring' : 'wirings'}` : '—'}
                </Text>
                {extraColumns.map((col) => (
                  <Box key={col.label} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                    {col.render(funcId)}
                  </Box>
                ))}
              </ListItem>
              {hasVersions && (
                <Collapse in={isExpanded}>
                  {versions.map((v: any) => (
                    <Box
                      key={v.version}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: GRID_COLUMNS,
                        padding: '6px 16px 6px 36px',
                        borderBottom: '1px solid var(--mantine-color-default-border)',
                        backgroundColor: 'var(--mantine-color-default-hover)',
                        columnGap: 12,
                      }}
                    >
                      <Group gap={6} wrap="nowrap">
                        <Badge size="xs" variant="filled" color={v.version === func.version ? 'blue' : 'gray'} ff="monospace" style={{ flexShrink: 0 }}>
                          v{v.version}
                        </Badge>
                        {v.version === func.version && (
                          <Text size="xs" c="var(--app-text-muted)" ff="monospace">latest</Text>
                        )}
                      </Group>
                      <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
                      <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
                      <Group gap={8}>
                        <Text size="xs" ff="monospace" c="var(--app-text-muted)">in: {v.inputHash}</Text>
                        <Text size="xs" ff="monospace" c="var(--app-text-muted)">out: {v.outputHash}</Text>
                      </Group>
                      <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
                      {extraColumns.map((col) => <Box key={col.label} />)}
                    </Box>
                  ))}
                </Collapse>
              )}
            </Box>
          )
        })}
      </ScrollArea>
    </>
  )

  return (
    <ListDetailLayout
      list={list}
      detail={selectedFunc ? <FunctionDetail func={selectedFunc} onClose={() => setSelected(null)} /> : null}
      hasSelection={!!selectedFunc}
      collapsible
      emptyMessage="Select a function"
      height="100vh"
    />
  )
}

export const FunctionsPage: React.FC<{
  extraColumns?: FunctionExtraColumn[]
  headerRight?: React.ReactNode
}> = ({ extraColumns, headerRight }) => {
  const rpc = usePikkuRPC()

  const { data: functions, isLoading } = useQuery({
    queryKey: ['functions-meta'],
    queryFn: () => rpc.invoke('console:getFunctionsMeta'),
  })

  if (isLoading || !functions) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  return (
    <PanelProvider>
      <FunctionsPageInner functions={functions} extraColumns={extraColumns} headerRight={headerRight} />
    </PanelProvider>
  )
}
