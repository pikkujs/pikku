import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import {
  PageDetailPanel,
  PagesOverviewCards,
  pageName,
  type TakePictures,
} from '../components/pages/PagesCards'
import { pageKey, type AppPage, type PageShots } from '../hooks/usePages'

export type PagesOverviewProps = {
  pages: AppPage[]
  shots: PageShots
  address: string
  onAddress: (address: string) => void
  take: TakePictures
  selectedKey: string | null
  onSelect: (key: string | null) => void
}

export const PagesOverview: React.FC<PagesOverviewProps> = ({
  pages,
  shots,
  address,
  onAddress,
  take,
  selectedKey,
  onSelect,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')
  const selected = pages.find((page) => pageKey(page) === selectedKey)

  return (
    <ResizablePanelLayout
      hidePanel
      surface="cards"
      sidePanel={
        selected ? (
          <PageDetailPanel
            key={pageKey(selected)}
            page={selected}
            shot={shots[pageKey(selected)]}
            address={address}
            take={take}
            onClose={() => onSelect(null)}
          />
        ) : undefined
      }
      sidePanelWidth={420}
      sidePanelLabel={m.pages_panel_label()}
      header={
        <ListPageHeader
          title={m.pages_page_title()}
          item={selected ? pageName(selected) : undefined}
          onTitle={selected ? () => onSelect(null) : undefined}
          filters={
            <Group gap="sm" wrap="nowrap" miw={0}>
              <TextInput
                data-testid="page-search"
                placeholder={m.pages_search()}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                w={240}
                maw="100%"
              />
            </Group>
          }
        />
      }
    >
      <CardsPage>
        <PagesOverviewCards
          pages={pages}
          shots={shots}
          searchQuery={searchQuery}
          address={address}
          onAddress={onAddress}
          take={take}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      </CardsPage>
    </ResizablePanelLayout>
  )
}
