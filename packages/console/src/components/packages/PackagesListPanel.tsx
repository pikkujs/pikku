import React, { useState } from 'react'
import { Group, TextInput, SegmentedControl } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Search } from 'lucide-react'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { ListPageHeader } from '../layout/PageLayout'
import { AddonsList } from './AddonsList'
import { ApisList } from './ApisList'
import type { AddonFilter } from './packageMeta'

type MainTab = 'addons' | 'apis'

export interface PackagesListPanelProps {
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}

/**
 * The addon gallery and the API catalogue, with the tab, filter and search
 * controls that drive them. Mount anywhere under a `ConsoleSurface`; picking a
 * package hands the id back so the host decides what opening it means.
 */
export const PackagesListPanel: React.FC<PackagesListPanelProps> = ({
  onSelect,
}) => {
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
                data-testid="packages-search"
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
