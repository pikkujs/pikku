import React, { useMemo } from 'react'
import { Text, Badge } from '@mantine/core'
import { FunctionSquare } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { funcWrapperDefs } from '../components/ui/badge-defs'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export interface FunctionExtraColumn {
  label: string
  width?: string
  align?: 'right'
  render: (funcId: string) => React.ReactNode
}

const FunctionsList: React.FC<{
  functions: any[]
  extraColumns?: FunctionExtraColumn[]
  headerRight?: React.ReactNode
}> = ({ functions, extraColumns = [], headerRight }) => {
  const { openFunction } = usePanelContext()
  const { functionUsedBy } = usePikkuMeta()

  const userFuncs = useMemo(
    () =>
      functions.filter((func: any) => {
        const id = func.pikkuFuncId
        return (
          (!func.functionType || func.functionType === 'user') &&
          !id?.startsWith('pikku')
        )
      }),
    [functions]
  )

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (func: any) => {
          const funcId = func.pikkuFuncName || func.pikkuFuncId
          return (
            <>
              <Text fw={500} truncate ff="monospace">
                {funcId}
              </Text>
              {(func.summary || func.description) && (
                <Text size="xs" c="dimmed" truncate>
                  {func.summary || func.description}
                </Text>
              )}
            </>
          )
        },
      },
      {
        key: 'version',
        header: 'VERSION',
        width: 80,
        render: (func: any) => (
          <Text size="sm" ff="monospace" c="var(--app-text-muted)">
            {func.version != null ? `v${func.version}` : '—'}
          </Text>
        ),
      },
      {
        key: 'type',
        header: 'TYPE',
        width: 140,
        render: (func: any) => {
          const wrapperDef = funcWrapperDefs[func.funcWrapper]
          return wrapperDef ? (
            <Badge size="sm" variant="light" color="gray" tt="none">
              {wrapperDef.label}
            </Badge>
          ) : null
        },
      },
      {
        key: 'auth',
        header: 'AUTH',
        width: 60,
        render: (func: any) => {
          const hasAuth = func.sessionless !== true
          return (
            <Text
              size="sm"
              ff="monospace"
              c={hasAuth ? '#86efac' : 'var(--app-text-muted)'}
            >
              {hasAuth ? 'Auth' : '—'}
            </Text>
          )
        },
      },
      {
        key: 'wirings',
        header: 'WIRINGS',
        width: 80,
        render: (func: any) => {
          const funcId = func.pikkuFuncName || func.pikkuFuncId
          const usedBy = functionUsedBy.get(funcId)
          const count = usedBy
            ? usedBy.transports.length + usedBy.jobs.length
            : 0
          return (
            <Text
              size="sm"
              ff="monospace"
              c={
                count > 0 ? 'var(--app-service-color)' : 'var(--app-text-muted)'
              }
            >
              {count > 0 ? String(count) : '—'}
            </Text>
          )
        },
      },
      ...extraColumns.map((col) => ({
        key: col.label,
        header: col.label.toUpperCase(),
        width: col.width,
        align: col.align,
        render: (func: any) =>
          col.render(func.pikkuFuncName || func.pikkuFuncId),
      })),
    ],
    [functionUsedBy, extraColumns]
  )

  return (
    <TableListPage
      title="Functions"
      icon={FunctionSquare}
      docsHref="https://pikku.dev/docs/core-features/functions"
      data={userFuncs}
      columns={columns}
      getKey={(func) => func.pikkuFuncName || func.pikkuFuncId}
      onRowClick={(func) =>
        openFunction(func.pikkuFuncName || func.pikkuFuncId, func)
      }
      searchPlaceholder="Search functions..."
      searchFilter={(func, q) =>
        func.pikkuFuncId?.toLowerCase().includes(q) ||
        func.summary?.toLowerCase().includes(q) ||
        func.description?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No functions found."
      headerRight={headerRight ?? null}
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

  return (
    <PanelProvider>
      <ResizablePanelLayout
        emptyPanelMessage="Select a function to view details"
        hidePanel={isLoading || !functions || functions.length === 0}
      >
        <FunctionsList
          functions={functions ?? []}
          extraColumns={extraColumns}
          headerRight={headerRight}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
