import React, { useState } from 'react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ConfigValuesCards } from '../components/config-values/ConfigValuesCards'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const VariablesPage: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        surface="cards"
        header={
          <ListPageHeader
            title={m.variables_title()}
            description={m.variables_description()}
            docsHref="https://pikku.dev/docs/core-features/variables"
            search={{
              placeholder: m.variables_search_placeholder(),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
          />
        }
        emptyPanelMessage={m.variables_select_item()}
      >
        <ConfigValuesCards
          kind="variable"
          searchQuery={searchQuery}
          emptyHero={emptyHero}
        />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
