import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CliTab } from '../components/tabs/CliTab'

export const CliPage: React.FC = () => {
  const [search, setSearch] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.cli_title()}
            description={m.cli_description()}
            docsHref="https://pikku.dev/docs/core-features/cli"
            search={{
              placeholder: m.cli_search_placeholder(),
              value: search,
              onChange: setSearch,
              width: 240,
            }}
          />
        }
        emptyPanelMessage={m.common_select_item()}
      >
        <CliTab searchQuery={search} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
