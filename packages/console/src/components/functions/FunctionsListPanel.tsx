import React, { useCallback, useMemo, useState } from 'react'
import { Badge, Box, Group, Stack, Text } from '@pikku/mantine/core'
import { FunctionSquare } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { TableListPage } from '../layout/TableListPage'
import { SectionCard } from '../ui/SectionCard'
import { kindLabel, kindOf, reachLabel } from './functionLabels'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import {
  useFilteredFunctions,
  useFunctionsMeta,
} from '../../hooks/useFunctionsMeta'
import {
  narrowFunctions,
  testsFor,
  type Attention,
  type KindFilter,
} from './useFunctionFilters'
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

const TEST_TONE: Record<FunctionTestData['status'], StatusTone> = {
  covered: 'good',
  partial: 'warn',
  uncovered: 'bad',
  unknown: 'neutral',
}

const funcIdOf = (func: any): string => func.pikkuFuncName || func.pikkuFuncId

export interface FunctionsListPanelProps {
  /** Filters by id, display name, summary and description. */
  searchQuery?: string
  /** Include Pikku's own internal functions. */
  showPikkuFunctions?: boolean
  extraColumns?: FunctionExtraColumn[]
  testsByFunction?: Record<string, FunctionTestData>
  emptyHero?: React.ReactNode
  /** Lists only functions of this kind. */
  kind?: KindFilter
  /** Lists only functions no scenario exercises. */
  attention?: Attention
}

/**
 * Every function in the project as a selectable table. Mount anywhere under a
 * {@link ConsoleSurface} — selecting a row opens it in the inspector.
 *
 * Fetches its own list, so a host needs nothing but the surface above it. The
 * search box, the filters and the Pikku-internals toggle stay with whoever owns
 * the header — {@link useFunctionFilters} builds them — and their values arrive
 * as props.
 */
export const FunctionsListPanel: React.FC<FunctionsListPanelProps> = ({
  searchQuery = '',
  showPikkuFunctions = false,
  extraColumns = [],
  testsByFunction,
  emptyHero,
  kind = 'all',
  attention = 'none',
}) => {
  useLocale()
  const { openFunction, activePanel } = usePanelContext()
  const { functionUsedBy } = usePikkuMeta()
  const { data: rawFunctions } = useFunctionsMeta()
  const visibleTotal = useFilteredFunctions(
    rawFunctions,
    '',
    showPikkuFunctions
  ).length
  const searched = useFilteredFunctions(
    rawFunctions,
    searchQuery,
    showPikkuFunctions
  )
  const allFunctions = useMemo(
    () => (rawFunctions ?? []) as any[],
    [rawFunctions]
  )

  usePanelUrl({
    type: 'function',
    items: allFunctions,
    getId: funcIdOf,
    open: openFunction,
  })

  const testsOf = useCallback(
    (func: any) => testsFor(func, testsByFunction),
    [testsByFunction]
  )

  const reachOf = useCallback(
    (func: any): string[] => {
      const usedBy = functionUsedBy.get(funcIdOf(func))
      const wired = usedBy
        ? [...usedBy.transports, ...usedBy.jobs].map((w: any) => w.type)
        : []
      return [...new Set([...(func.expose ? ['app'] : []), ...wired])]
    },
    [functionUsedBy]
  )

  const hasTests = searched.some((func) => !!testsOf(func))
  const hasVersions = searched.some((func) => func.version != null)
  const { functions } = narrowFunctions(searched, {
    kind,
    attention,
    testsByFunction,
  })

  const columns = [
    {
      key: 'name',
      header: m.functions_col_function(),
      width: '100%',
      maxWidth: 0,
      render: (func: any) => {
        const funcId = funcIdOf(func)
        return (
          <>
            <Text size="sm" fw={600} truncate>
              {asI18n(func.displayName || toEnglishName(funcId))}
            </Text>
            <Text size="xs" ff="monospace" c="dimmed" truncate>
              {asI18n(funcId)}
            </Text>
          </>
        )
      },
    },
    {
      key: 'access',
      header: m.functions_col_access(),
      width: 130,
      render: (func: any) =>
        func.sessionless === true ? (
          <StatusBadge tone="neutral" size="lg" dot={false}>
            {m.functions_access_anyone()}
          </StatusBadge>
        ) : (
          <StatusBadge tone="info" size="lg" dot={false}>
            {m.functions_access_signed_in()}
          </StatusBadge>
        ),
    },
    {
      key: 'reach',
      header: m.functions_col_reach(),
      width: 200,
      render: (func: any) => {
        const reach = reachOf(func)
        return reach.length === 0 ? (
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {m.functions_reach_none()}
          </Text>
        ) : (
          <Group gap={4} wrap="wrap">
            {reach.map((type) => (
              <Badge
                key={type}
                size="md"
                variant="default"
                radius="sm"
                c="dimmed"
                fw={500}
                bd="1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))"
              >
                {reachLabel(type)}
              </Badge>
            ))}
          </Group>
        )
      },
    },
    ...(hasTests
      ? [
          {
            key: 'tests',
            header: m.functions_col_tests(),
            width: 120,
            render: (func: any) => {
              const tests = testsOf(func)
              if (!tests || tests.status === 'unknown') {
                return (
                  <StatusBadge tone="neutral" size="lg">
                    {m.functions_tests_none()}
                  </StatusBadge>
                )
              }
              return (
                <StatusBadge tone={TEST_TONE[tests.status]} size="lg">
                  {asI18n(
                    tests.status === 'covered'
                      ? `${tests.coveredLines}/${tests.totalLines}`
                      : `${Math.round(tests.ratio * 100)}%`
                  )}
                </StatusBadge>
              )
            },
          },
        ]
      : []),
    {
      key: 'kind',
      header: m.functions_col_kind(),
      width: 110,
      render: (func: any) => (
        <Text size="sm" c="dimmed">
          {kindLabel(kindOf(func))}
        </Text>
      ),
    },
    ...(hasVersions
      ? [
          {
            key: 'version',
            header: m.functions_col_version(),
            width: 80,
            render: (func: any) => (
              <Text size="xs" ff="monospace" c="dimmed">
                {asI18n(func.version != null ? `v${func.version}` : '—')}
              </Text>
            ),
          },
        ]
      : []),
    ...extraColumns.map((col) => ({
      key: col.label,
      header: col.label,
      width: col.width,
      align: col.align,
      render: (func: any) => col.render(funcIdOf(func)),
    })),
  ]

  const table = (
    <TableListPage
      title="Functions"
      icon={FunctionSquare}
      docsHref="https://pikku.dev/docs/core-features/functions"
      data={functions}
      columns={columns}
      getKey={funcIdOf}
      onRowClick={(func) => openFunction(funcIdOf(func), func)}
      isSelected={(func) => activePanel === `function-${funcIdOf(func)}`}
      emptyMessage={m.functions_empty_message()}
      emptyHero={emptyHero}
      framed
      compact
    />
  )

  if (allFunctions.length === 0) return table

  return (
    <SectionCard
      fill
      title={m.functions_card_title()}
      subtitle={m.functions_count({ count: visibleTotal })}
      blurb={m.functions_card_blurb()}
      testId="functions-card"
    >
      <Stack gap="sm" mt="md" style={{ flex: 1, minHeight: 0 }}>
        {table}
        <Text size="xs" c="dimmed">
          {m.functions_showing({
            shown: functions.length,
            total: visibleTotal,
          })}
        </Text>
      </Stack>
    </SectionCard>
  )
}
