import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CliListPanel } from '../components/cli/CliListPanel'

export type CliPageProps = {
  emptyHero?: React.ReactNode
}

export const CliPage: React.FC<CliPageProps> = ({ emptyHero }) => {
  const [search, setSearch] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.cli_title()}
            description={m.cli_description()}
            search={{
              placeholder: m.cli_search_placeholder(),
              value: search,
              onChange: setSearch,
            }}
          />
        }
        hidePanel
      >
        <CliListPanel searchQuery={search} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
