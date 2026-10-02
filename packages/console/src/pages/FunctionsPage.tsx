import React from 'react'
import { useSearchParams } from '../router'
import { Box } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { FunctionsListPanel } from '../components/functions/FunctionsListPanel'
import { useFunctionFilters } from '../components/functions/useFunctionFilters'
import type {
  FunctionExtraColumn,
  FunctionTestData,
} from '../components/functions/FunctionsListPanel'
import { useFunctionsMeta } from '../hooks/useFunctionsMeta'

export type {
  FunctionExtraColumn,
  FunctionTestScenario,
  FunctionTestData,
} from '../components/functions/FunctionsListPanel'

export const FunctionsPage: React.FC<{
  extraColumns?: FunctionExtraColumn[]
  headerRight?: React.ReactNode
  testsByFunction?: Record<string, FunctionTestData>
  emptyHero?: React.ReactNode
}> = ({ extraColumns, headerRight, testsByFunction, emptyHero }) => {
  useLocale()
  // `?search=` makes a function linkable from elsewhere in the console — the
  // virtual users screen sends you here from an endpoint it counted. Only the
  // initial value: from then on the box is yours, and rewriting the URL as you
  // type would put every keystroke in the back button.
  const [searchParams] = useSearchParams()
  const { data: rawFunctions, isLoading } = useFunctionsMeta()
  const filters = useFunctionFilters(rawFunctions, {
    initialSearch: searchParams.get('search') ?? '',
    testsByFunction,
  })

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        surface="cards"
        header={
          <ListPageHeader
            title={m.functions_title()}
            description={m.functions_tagline()}
            docsHref="https://pikku.dev/docs/core-features/functions"
            search={filters.search}
            headerFilters={filters.headerFilters}
            filters={headerRight}
          />
        }
        emptyPanelMessage={m.functions_select_function()}
        hidePanel={
          isLoading ||
          !rawFunctions ||
          (rawFunctions as unknown as any[]).length === 0
        }
      >
        <Box
          data-help="list"
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <FunctionsListPanel
            searchQuery={filters.searchQuery}
            showPikkuFunctions={filters.showPikkuFunctions}
            kind={filters.kind}
            attention={filters.attention}
            extraColumns={extraColumns}
            testsByFunction={testsByFunction}
            emptyHero={emptyHero}
          />
        </Box>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
