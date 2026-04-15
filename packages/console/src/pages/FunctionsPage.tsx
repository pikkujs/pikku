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
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider } from '../context/PanelContext'
import { usePanelContext } from '../context/PanelContext'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { useFunctionMeta } from '../hooks/useWirings'
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

const GRID_COLUMNS = '1fr 140px 60px 100px 80px'

const CollapsibleSchema: React.FunctionComponent<{
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
        <Text size="xs" c="var(--app-section-label)" style={{ fontSize: 9 }}>
          {open ? '▾' : '▸'}
        </Text>
        <Text
          size="xs"
          fw={600}
          ff="monospace"
          c="var(--app-section-label)"
          tt="uppercase"
          className={classes.gridHeaderLabel}
        >
          {label}
        </Text>
        <Text size="xs" ff="monospace" c="var(--app-text-muted)">
          {schemaName}
        </Text>
      </UnstyledButton>
      {open && <SchemaSection schemaName={schemaName} />}
    </Box>
  )
}

const FunctionDetail: React.FunctionComponent<{ func: any }> = ({ func }) => {
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
            <Text size="xs" c="var(--app-text-muted)" lh={1.5}>
              {func.summary || func.description}
            </Text>
          )}
        </Box>
        {funcWrapperDefs[func.funcWrapper] && (
          <Badge size="sm" variant="light" color="gray">
            {funcWrapperDefs[func.funcWrapper].label}
          </Badge>
        )}
      </Box>
      <Box p="md" className={classes.flexGrow}>
        <SectionLabel>Metadata</SectionLabel>

        {func.exportedName && (
          <MetaRow label="export" labelWidth={90}>
            <Text size="xs" ff="monospace" c="var(--app-meta-value)">
              {func.exportedName}
            </Text>
          </MetaRow>
        )}

        {func.sourceFile && (
          <MetaRow label="source" labelWidth={90}>
            <Text size="xs" ff="monospace" c="var(--app-text)" truncate>
              {func.sourceFile.replace(/^.*\/src\//, 'src/')}
            </Text>
          </MetaRow>
        )}

        <MetaRow label="sessionless" labelWidth={90}>
          <Text size="xs" ff="monospace" c={func.sessionless ? '#86efac' : 'var(--app-text-muted)'}>
            {func.sessionless ? 'true' : 'false'}
          </Text>
        </MetaRow>

        <MetaRow label="version" labelWidth={90}>
          {func.version ? (
            <Group gap={6}>
              <Text size="xs" ff="monospace" c="var(--app-meta-value)">
                v{func.version}
              </Text>
              {func.contractHash && (
                <Text size="xs" ff="monospace" c="var(--app-text-muted)">
                  ({func.contractHash})
                </Text>
              )}
            </Group>
          ) : (
            <Text size="xs" ff="monospace" c="var(--app-text-muted)">
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
            <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
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
            <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
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
            <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
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
            <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
          )}
        </MetaRow>

        {allWirings.length > 0 && (
          <>
            <SectionLabel>Wired To ({allWirings.length})</SectionLabel>
            {allWirings.map((w: any) => (
              <MetaRow key={w.id} label={w.type} labelWidth={90}>
                <Text size="xs" ff="monospace" c="var(--app-service-color)">
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

const FunctionsPageInner: React.FunctionComponent<{
  functions: any[]
}> = ({ functions }) => {
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const { functionUsedBy } = usePikkuMeta()

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
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search functions..."
      />
      <GridHeader
        columns={[
          { label: 'Name' },
          { label: 'Type' },
          { label: 'Auth' },
          { label: 'Permissions' },
          { label: 'Wirings', align: 'right' },
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

          return (
            <ListItem
              key={funcId}
              active={isActive}
              onClick={() => setSelected(funcId)}
              gridTemplateColumns={GRID_COLUMNS}
              padding="9px 16px"
            >
              <Box>
                <Text
                  size="xs"
                  ff="monospace"
                  c={isActive ? 'var(--app-meta-value)' : 'var(--app-text)'}
                  mb={1}
                >
                  {funcId}
                </Text>
                <Text
                  size="xs"
                  ff="monospace"
                  c="var(--app-text-muted)"
                  truncate
                  style={{
                    fontSize: 9,
                    maxWidth: 280,
                    opacity: func.summary || func.description ? 1 : 0.4,
                  }}
                >
                  {func.summary || func.description || 'No description'}
                </Text>
              </Box>
              {wrapperDef && (
                <Badge size="xs" variant="light" color="gray" tt="none">
                  {wrapperDef.label}
                </Badge>
              )}
              <Text size="xs" ff="monospace" c={hasAuth ? '#86efac' : 'var(--app-text-muted)'}>
                {hasAuth ? 'Auth' : '—'}
              </Text>
              <Text
                size="xs"
                ff="monospace"
                c="var(--app-text-muted)"
                truncate
              >
                {func.permissions?.length > 0
                  ? func.permissions.map((p: any) => p.name || p).join(', ')
                  : '—'}
              </Text>
              <Text
                size="xs"
                ff="monospace"
                c={wiringCount > 0 ? 'var(--app-service-color)' : 'var(--app-text-muted)'}
                ta="right"
              >
                {wiringCount > 0
                  ? `${wiringCount} ${wiringCount === 1 ? 'wiring' : 'wirings'}`
                  : '—'}
              </Text>
            </ListItem>
          )
        })}
      </ScrollArea>
    </>
  )

  return (
    <ListDetailLayout
      list={list}
      detail={selectedFunc ? <FunctionDetail func={selectedFunc} /> : null}
      hasSelection={!!selectedFunc}
      emptyMessage="Select a function"
      height="100vh"
    />
  )
}

export const FunctionsPage: React.FunctionComponent = () => {
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
      <FunctionsPageInner functions={functions} />
    </PanelProvider>
  )
}
