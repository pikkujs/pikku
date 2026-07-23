import React, { useState } from 'react'
import { useSearchParams } from '../router'
import { PackageDetailPage } from './PackageDetailPage'
import { Group, TextInput, SegmentedControl } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Search } from 'lucide-react'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { AddonsList } from '../components/packages/AddonsList'
import { ApisList } from '../components/packages/ApisList'
import type { AddonFilter } from '../components/packages/packageMeta'
import { PanelProvider } from '../context/PanelContext'

type MainTab = 'addons' | 'apis'

const PackagesList: React.FC<{
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ onSelect }) => {
  const [tab, setTab] = useState<MainTab>('addons')
  const [filter, setFilter] = useState<AddonFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  useLocale()

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    setTab(value as MainTab)
  }

  const mainTabs = [
    { value: 'addons', label: m.packages_tab_addons() },
    { value: 'apis', label: m.packages_tab_apis() },
  ]
  const addonFilters = [
    { value: 'all', label: m.packages_filter_all() },
    { value: 'official', label: m.packages_filter_official() },
    { value: 'installed', label: m.packages_filter_installed() },
  ]

  return (
    <ResizablePanelLayout
      hidePanel
      header={
        <ListPageHeader
          title={m.packages_title()}
          description={m.packages_description()}
          docsHref="https://pikku.dev/docs/external-packages"
          filters={
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={
                  tab === 'apis'
                    ? m.packages_search_apis_placeholder()
                    : m.packages_search_addons_placeholder()
                }
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
              {tab === 'addons' && (
                <SegmentedControl
                  size="xs"
                  value={filter}
                  onChange={(v) => setFilter(v as AddonFilter)}
                  data={addonFilters}
                />
              )}
              <SegmentedControl
                size="xs"
                value={tab}
                onChange={handleTabChange}
                data={mainTabs}
              />
            </Group>
          }
        />
      }
    >
      {tab === 'apis' ? (
        <ApisList searchQuery={searchQuery} />
      ) : (
        <AddonsList
          searchQuery={searchQuery}
          filter={filter}
          onSelect={onSelect}
        />
      )}
    </ResizablePanelLayout>
  )
}

const PackagesPageContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('id')
  const source = (searchParams.get('source') ?? 'community') as
    | 'installed'
    | 'community'
    | 'api'

  if (selectedId) {
    return (
      <PackageDetailPage
        id={selectedId}
        source={source}
        onBack={() => setSearchParams({})}
      />
    )
  }

  return (
    <PackagesList
      onSelect={(id, src) => setSearchParams({ id, source: src })}
    />
  )
}

// `emptyHero` is accepted for backwards compat with the fabric console shell
// but no longer used — the addons tab always renders its own gallery/empty state.
export const PackagesPage: React.FC<{ emptyHero?: React.ReactNode }> = () => {
  return (
    <PanelProvider>
      <PackagesPageContent />
    </PanelProvider>
  )
}
