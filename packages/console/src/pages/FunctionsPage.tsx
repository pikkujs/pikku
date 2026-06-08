import React, { useMemo, useState } from 'react'
import { Text, Badge, Group, UnstyledButton, TextInput } from '@mantine/core'
import { FunctionSquare, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { PikkuToggle } from '../components/ui/PikkuToggle'
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

export interface FunctionTestScenario {
  featureName: string
  featureFile?: string
  scenarioName: string
  status: 'pass' | 'fail'
  duration?: string
  steps: string[]
}

export interface FunctionTestData {
  status: 'covered' | 'partial' | 'uncovered' | 'unknown'
  coveredLines: number
  totalLines: number
  ratio: number
  missedLines?: number[]
  scenarios: FunctionTestScenario[]
}

const TEST_STATUS_COLOR: Record<FunctionTestData['status'], string> = {
  covered: 'green',
  partial: 'yellow',
  uncovered: 'red',
  unknown: 'gray',
}

function isPikkuFunction(func: any): boolean {
  return Array.isArray(func.tags) && func.tags.includes('pikku')
}

const FunctionsList: React.FC<{
  functions: any[]
  extraColumns?: FunctionExtraColumn[]
  testsByFunction?: Record<string, FunctionTestData>
}> = ({ functions, extraColumns = [], testsByFunction }) => {
  const { openFunction } = usePanelContext()
  const { functionUsedBy } = usePikkuMeta()
  const hasTestsColumn = useMemo(
    () => !!testsByFunction || functions.some((func: any) => !!func.tests),
    [functions, testsByFunction]
  )

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        width: 320,
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
      ...(hasTestsColumn
        ? [
            {
              key: 'tests',
              header: 'TESTS',
              width: 180,
              render: (func: any) => {
                const funcId = func.pikkuFuncName || func.pikkuFuncId
                const tests = func.tests ?? testsByFunction?.[funcId]
                if (!tests) {
                  return (
                    <UnstyledButton
                      onClick={(event) => {
                        event.stopPropagation()
                        openFunction(funcId, func)
                      }}
                    >
                      <Badge size="sm" variant="light" color="gray">
                        unknown
                      </Badge>
                    </UnstyledButton>
                  )
                }

                const status = tests.status as FunctionTestData['status']
                const ratioLabel =
                  tests.status === 'covered'
                    ? `${tests.coveredLines}/${tests.totalLines}`
                    : tests.status === 'unknown'
                      ? 'unknown'
                      : `${Math.round(tests.ratio * 100)}%`

                return (
                  <UnstyledButton
                    onClick={(event) => {
                      event.stopPropagation()
                      openFunction(funcId, { ...func, tests })
                    }}
                    style={{ display: 'block', textAlign: 'left' }}
                  >
                    <Group gap={6} wrap="nowrap">
                      <Badge
                        size="sm"
                        variant="light"
                        color={TEST_STATUS_COLOR[status]}
                      >
                        {ratioLabel}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {tests.scenarios.length === 0
                          ? 'No tests'
                          : `${tests.scenarios.length} linked`}
                      </Text>
                    </Group>
                  </UnstyledButton>
                )
              },
            },
          ]
        : []),
      ...extraColumns.map((col) => ({
        key: col.label,
        header: col.label.toUpperCase(),
        width: col.width,
        align: col.align,
        render: (func: any) =>
          col.render(func.pikkuFuncName || func.pikkuFuncId),
      })),
    ],
    [
      functionUsedBy,
      extraColumns,
      hasTestsColumn,
      openFunction,
      testsByFunction,
    ]
  )

  return (
    <TableListPage
      title="Functions"
      icon={FunctionSquare}
      docsHref="https://pikku.dev/docs/core-features/functions"
      data={functions}
      columns={columns}
      getKey={(func) => func.pikkuFuncName || func.pikkuFuncId}
      onRowClick={(func) =>
        openFunction(func.pikkuFuncName || func.pikkuFuncId, func)
      }
      emptyMessage="No functions found."
    />
  )
}

export const FunctionsPage: React.FC<{
  extraColumns?: FunctionExtraColumn[]
  headerRight?: React.ReactNode
  testsByFunction?: Record<string, FunctionTestData>
}> = ({ extraColumns, headerRight, testsByFunction }) => {
  const rpc = usePikkuRPC()
  const [searchQuery, setSearchQuery] = useState('')
  const [showPikkuFunctions, setShowPikkuFunctions] = useState(false)

  const { data: rawFunctions, isLoading } = useQuery({
    queryKey: ['functions-meta'],
    queryFn: () => rpc.invoke('console:getFunctionsMeta'),
  })

  const functions = useMemo(() => {
    const all = (rawFunctions ?? []) as any[]
    const q = searchQuery.toLowerCase()
    return all.filter((func: any) => {
      if (!showPikkuFunctions && isPikkuFunction(func)) return false
      if (!q) return true
      return (
        func.pikkuFuncId?.toLowerCase().includes(q) ||
        func.summary?.toLowerCase().includes(q) ||
        func.description?.toLowerCase().includes(q)
      )
    })
  }, [rawFunctions, searchQuery, showPikkuFunctions])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title="Functions"
            description="All registered pikku functions across your project"
            docsHref="https://pikku.dev/docs/core-features/functions"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder="Search functions..."
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
                <PikkuToggle
                  checked={showPikkuFunctions}
                  onChange={setShowPikkuFunctions}
                  tooltip="Show Pikku internals"
                />
                {headerRight}
              </Group>
            }
          />
        }
        emptyPanelMessage="Select a function to view details"
        hidePanel={isLoading || !rawFunctions || (rawFunctions as unknown as any[]).length === 0}
      >
        <FunctionsList
          functions={functions}
          extraColumns={extraColumns}
          testsByFunction={testsByFunction}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
