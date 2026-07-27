import React, { useMemo } from 'react'
import { Text, Badge, Group, UnstyledButton } from '@pikku/mantine/core'
import { FunctionSquare } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { TableListPage } from '../layout/TableListPage'
import { funcWrapperDefs } from '../ui/badge-defs'
import {
  useFilteredFunctions,
  useFunctionsMeta,
} from '../../hooks/useFunctionsMeta'
import { toEnglishName } from '../../lib/strings'

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

export interface FunctionsListPanelProps {
  /** Filters by id, display name, summary and description. */
  searchQuery?: string
  /** Include Pikku's own internal functions. */
  showPikkuFunctions?: boolean
  extraColumns?: FunctionExtraColumn[]
  testsByFunction?: Record<string, FunctionTestData>
  emptyHero?: React.ReactNode
}

/**
 * Every function in the project as a selectable table. Mount anywhere under a
 * {@link ConsoleSurface} — selecting a row opens it in the inspector.
 *
 * Fetches its own list, so a host needs nothing but the surface above it. The
 * search box and the Pikku-internals toggle stay with whoever owns the header;
 * their values arrive as props.
 */
export const FunctionsListPanel: React.FC<FunctionsListPanelProps> = ({
  searchQuery = '',
  showPikkuFunctions = false,
  extraColumns = [],
  testsByFunction,
  emptyHero,
}) => {
  useLocale()
  const { openFunction } = usePanelContext()
  const { functionUsedBy } = usePikkuMeta()
  const { data: rawFunctions } = useFunctionsMeta()
  const functions = useFilteredFunctions(
    rawFunctions,
    searchQuery,
    showPikkuFunctions
  )
  const hasTestsColumn = useMemo(
    () => !!testsByFunction || functions.some((func: any) => !!func.tests),
    [functions, testsByFunction]
  )

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        maxWidth: 350,
        render: (func: any) => {
          const funcId = func.pikkuFuncName || func.pikkuFuncId
          const englishName = func.displayName || toEnglishName(funcId)
          const description = func.summary || func.description
          return (
            <>
              <Text fw={500} truncate>
                {asI18n(englishName)}
              </Text>
              <Text size="xs" c="dimmed" truncate ff="monospace">
                {asI18n(`${funcId}${description ? ` · ${description}` : ''}`)}
              </Text>
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
            {asI18n(func.version != null ? `v${func.version}` : '—')}
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
              {asI18n(wrapperDef.label)}
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
              {asI18n(hasAuth ? 'Auth' : '—')}
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
              {asI18n(count > 0 ? String(count) : '—')}
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
                        {asI18n('unknown')}
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
                        {asI18n(ratioLabel)}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {asI18n(
                          tests.scenarios.length === 0
                            ? 'No tests'
                            : `${tests.scenarios.length} linked`
                        )}
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
      emptyMessage={m.functions_empty_message()}
      emptyHero={emptyHero}
    />
  )
}
