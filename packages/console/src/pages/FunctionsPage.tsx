import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  TextInput,
  ScrollArea,
  UnstyledButton,
  Group,
  Badge,
  Center,
  Loader,
} from '@mantine/core'
import { Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider } from '../context/PanelContext'
import { usePanelContext } from '../context/PanelContext'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { useFunctionMeta, useSchema } from '../hooks/useWirings'
import { CommonDetails } from '../components/project/panels/shared/CommonDetails'
import { SchemaSection } from '../components/project/panels/shared/SchemaSection'
import { funcWrapperDefs } from '../components/ui/badge-defs'

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
      style={{ minWidth: 90, flexShrink: 0 }}
    >
      {label}
    </Text>
    <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
  </Box>
)

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
          style={{ letterSpacing: '0.1em' }}
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
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <Box
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--app-row-border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <Box style={{ flex: 1 }}>
          <Text size="sm" fw={600} ff="monospace" c="var(--app-meta-value)" mb={4}>
            {funcId}
          </Text>
          {(func.summary || func.description) && (
            <Text size="xs" c="var(--app-text-muted)" style={{ lineHeight: 1.5 }}>
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
      <Box p="md" style={{ flex: 1 }}>
        <SLabel>Metadata</SLabel>

        {func.exportedName && (
          <MetaRow label="export">
            <Text size="xs" ff="monospace" c="var(--app-meta-value)">
              {func.exportedName}
            </Text>
          </MetaRow>
        )}

        {func.sourceFile && (
          <MetaRow label="source">
            <Text size="xs" ff="monospace" c="var(--app-text)" truncate>
              {func.sourceFile.replace(/^.*\/src\//, 'src/')}
            </Text>
          </MetaRow>
        )}

        <MetaRow label="sessionless">
          <Text size="xs" ff="monospace" c={func.sessionless ? '#86efac' : 'var(--app-text-muted)'}>
            {func.sessionless ? 'true' : 'false'}
          </Text>
        </MetaRow>

        <MetaRow label="version">
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

        <MetaRow label="services">
          {func.services?.services?.length > 0 ? (
            <Group gap={5}>
              {func.services.services.map((svc: string) => (
                <Badge
                  key={svc}
                  size="sm"
                  variant="light"
                  tt="none"
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
          ) : (
            <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
          )}
        </MetaRow>

        <MetaRow label="tags">
          {func.tags?.length > 0 ? (
            <Group gap={4}>
              {func.tags.map((tag: string, i: number) => (
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
          ) : (
            <Text size="xs" ff="monospace" c="var(--app-text-muted)">—</Text>
          )}
        </MetaRow>

        <MetaRow label="middleware">
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

        <MetaRow label="permissions">
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
            <SLabel>Wired To ({allWirings.length})</SLabel>
            {allWirings.map((w: any) => (
              <MetaRow key={w.id} label={w.type}>
                <Text size="xs" ff="monospace" c="var(--app-service-color)">
                  {w.name}
                </Text>
              </MetaRow>
            ))}
          </>
        )}

        {(inputSchemaName || outputSchemaName) && <SLabel>Schemas</SLabel>}
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

  return (
    <Box style={{ display: 'flex', height: '100vh' }}>
      {/* List */}
      <Box
        style={{
          flex: 1,
          borderRight: '1px solid var(--app-row-border)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box p="xs">
          <TextInput
            placeholder="Search functions..."
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="xs"
          />
        </Box>
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 140px 60px 100px 80px',
            padding: '7px 16px',
            borderBottom: '1px solid var(--app-row-border)',
            background: '#0a0c12',
            flexShrink: 0,
          }}
        >
          {['Name', 'Type', 'Auth', 'Permissions', 'Wirings'].map((h) => (
            <Text
              key={h}
              size="xs"
              fw={600}
              ff="monospace"
              c="var(--app-section-label)"
              tt="uppercase"
              style={{
                letterSpacing: '0.1em',
                fontSize: 9,
                textAlign: h === 'Wirings' ? 'right' : undefined,
              }}
            >
              {h}
            </Text>
          ))}
        </Box>
        <ScrollArea style={{ flex: 1 }}>
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
              <UnstyledButton
                key={funcId}
                onClick={() => setSelected(funcId)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 140px 60px 100px 80px',
                  padding: '9px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderLeft: isActive
                    ? '2px solid #7c3aed'
                    : '2px solid transparent',
                  background: isActive
                    ? 'rgba(124,58,237,0.05)'
                    : undefined,
                  width: '100%',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  alignItems: 'center',
                }}
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
              </UnstyledButton>
            )
          })}
        </ScrollArea>
      </Box>

      {/* Detail */}
      <Box style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {selectedFunc ? (
          <FunctionDetail func={selectedFunc} />
        ) : (
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Text c="dimmed" ff="monospace" size="sm">
              Select a function
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export const FunctionsPage: React.FunctionComponent = () => {
  const rpc = usePikkuRPC()

  const { data: functions, isLoading } = useQuery({
    queryKey: ['functions-meta'],
    queryFn: () => rpc.invoke('console:getFunctionsMeta', null),
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
