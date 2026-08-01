import React, { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { PikkuToggle } from '../components/ui/PikkuToggle'
import { FunctionsListPanel } from '../components/functions/FunctionsListPanel'
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
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('search') ?? ''
  )
  const [showPikkuFunctions, setShowPikkuFunctions] = useState(false)

  const { data: rawFunctions, isLoading } = useFunctionsMeta()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.functions_title()}
            description={m.functions_description()}
            docsHref="https://pikku.dev/docs/core-features/functions"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder={m.functions_search_placeholder()}
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
                <PikkuToggle
                  checked={showPikkuFunctions}
                  onChange={setShowPikkuFunctions}
                  tooltip={m.common_show_pikku_internals()}
                />
                {headerRight}
              </Group>
            }
          />
        }
        emptyPanelMessage={m.functions_select_function()}
        hidePanel={isLoading || !rawFunctions || (rawFunctions as unknown as any[]).length === 0}
      >
        <FunctionsListPanel
          searchQuery={searchQuery}
          showPikkuFunctions={showPikkuFunctions}
          extraColumns={extraColumns}
          testsByFunction={testsByFunction}
          emptyHero={emptyHero}
        />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
