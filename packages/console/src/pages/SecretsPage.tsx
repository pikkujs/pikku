import React, { useState } from 'react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SecretsListPanel } from '../components/secrets/SecretsListPanel'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const SecretsPage: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        flushBody
        header={
          <ListPageHeader
            title={m.secrets_title()}
            description={m.secrets_description()}
            docsHref="https://pikku.dev/docs/core-features/secrets"
            search={{
              placeholder: m.secrets_search_placeholder(),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
          />
        }
        emptyPanelMessage={m.secrets_select_item()}
      >
        <SecretsListPanel searchQuery={searchQuery} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
