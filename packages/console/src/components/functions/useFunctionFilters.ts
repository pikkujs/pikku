import { useState } from 'react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ShellHeaderFilter } from '../ui/shellHeaderShared'
import { useFilteredFunctions } from '../../hooks/useFunctionsMeta'
import {
  KIND_ORDER,
  kindLabel,
  kindOf,
  type FunctionKind,
} from './functionLabels'
import type { FunctionTestData } from './FunctionsListPanel'

export type KindFilter = 'all' | FunctionKind
export type Attention = 'none' | 'untested'

const funcIdOf = (func: any): string => func.pikkuFuncName || func.pikkuFuncId

export const testsFor = (
  func: any,
  testsByFunction?: Record<string, FunctionTestData>
): FunctionTestData | undefined =>
  func.tests ?? testsByFunction?.[funcIdOf(func)]

/**
 * Narrows the searched functions by kind and test coverage, with the counts
 * each control shows. Coverage only narrows when something is untested, so a
 * stale "No tests" selection never empties the list.
 */
export const narrowFunctions = (
  searched: any[],
  {
    kind,
    attention,
    testsByFunction,
  }: {
    kind: KindFilter
    attention: Attention
    testsByFunction?: Record<string, FunctionTestData>
  }
) => {
  const kindCounts = new Map<FunctionKind, number>()
  for (const func of searched) {
    const k = kindOf(func)
    kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1)
  }
  const untested = (func: any) => {
    const tests = testsFor(func, testsByFunction)
    return (
      !tests || tests.status === 'uncovered' || tests.scenarios.length === 0
    )
  }
  const hasTests = searched.some((func) => !!testsFor(func, testsByFunction))
  const ofKind = searched.filter(
    (func) => kind === 'all' || kindOf(func) === kind
  )
  const untestedCount = hasTests ? ofKind.filter(untested).length : 0
  const functions =
    attention === 'untested' && untestedCount > 0
      ? ofKind.filter(untested)
      : ofKind
  return { kindCounts, untestedCount, functions }
}

/**
 * The Functions page's header controls: the search, the kind and coverage
 * filters, and whether Pikku's own functions are listed. The page owns them so
 * they sit in its header; the list reads the values.
 */
export const useFunctionFilters = (
  rawFunctions: unknown,
  {
    initialSearch,
    testsByFunction,
  }: {
    initialSearch: string
    testsByFunction?: Record<string, FunctionTestData>
  }
) => {
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [showPikkuFunctions, setShowPikkuFunctions] = useState(false)
  const [kind, setKind] = useState<KindFilter>('all')
  const [attention, setAttention] = useState<Attention>('none')
  const searched = useFilteredFunctions(
    rawFunctions,
    searchQuery,
    showPikkuFunctions
  )
  const { kindCounts, untestedCount } = narrowFunctions(searched, {
    kind,
    attention,
    testsByFunction,
  })
  const kinds = KIND_ORDER.filter((entry) => kindCounts.has(entry))

  const headerFilters: ShellHeaderFilter[] = [
    ...(kinds.length > 1
      ? [
          {
            key: 'kind',
            label: m.functions_filter_kind(),
            value: kind,
            priority: 3,
            onChange: (value: string) => setKind(value as KindFilter),
            testId: 'functions-filter-kind',
            options: [
              {
                value: 'all',
                label: m.functions_filter_all({ count: searched.length }),
              },
              ...kinds.map((entry) => ({
                value: entry,
                label: asI18n(`${kindLabel(entry)} ${kindCounts.get(entry)}`),
              })),
            ],
          },
        ]
      : []),
    ...(untestedCount > 0
      ? [
          {
            key: 'tests',
            label: m.functions_filter_tests(),
            value: attention,
            priority: 2,
            onChange: (value: string) => setAttention(value as Attention),
            testId: 'functions-filter-tests',
            options: [
              { value: 'none', label: m.functions_filter_tests_any() },
              {
                value: 'untested',
                label: m.functions_filter_untested({ count: untestedCount }),
              },
            ],
          },
        ]
      : []),
    {
      key: 'builtin',
      label: m.functions_filter_builtin(),
      value: showPikkuFunctions ? 'shown' : 'hidden',
      priority: 1,
      onChange: (value: string) => setShowPikkuFunctions(value === 'shown'),
      testId: 'functions-filter-builtin',
      helpAnchor: 'internals',
      options: [
        { value: 'hidden', label: m.functions_builtin_hidden() },
        { value: 'shown', label: m.functions_builtin_shown() },
      ],
    },
  ]

  return {
    search: {
      placeholder: m.functions_search_by(),
      value: searchQuery,
      onChange: setSearchQuery,
      width: 240,
      helpAnchor: 'search',
    },
    headerFilters,
    searchQuery,
    showPikkuFunctions,
    kind,
    attention,
  }
}
