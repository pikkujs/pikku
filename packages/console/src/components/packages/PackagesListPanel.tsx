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
import type { PackagesBrowse, PackagesTab } from '../../hooks/usePackagesBrowse'

export interface PackagesListPanelProps {
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
  /**
   * Browse state from `usePackagesBrowse()`. Pass it and the host owns where the
   * category rail lives (`PackagesBrowseRail` in its own panel or sheet) while
   * this panel drops its inline copy; omit it and the panel is self-contained.
   */
  browse?: PackagesBrowse
}

/**
 * The addon gallery and the API catalogue, with the tab, filter and search
 * controls that drive them. Mount anywhere under a `ConsoleSurface`; picking a
 * package hands the id back so the host decides what opening it means.
 */
export const PackagesListPanel: React.FC<PackagesListPanelProps> = ({
  onSelect,
  browse,
}) => {
  const [ownTab, setOwnTab] = useState<PackagesTab>('addons')
  const tab = browse?.tab ?? ownTab
  const [filter, setFilter] = useState<AddonFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  useLocale()

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    if (browse) browse.setTab(value as PackagesTab)
    else setOwnTab(value as PackagesTab)
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
        <ApisList
          searchQuery={searchQuery}
          category={browse?.category}
          onCategoryChange={browse?.setCategory}
        />
      ) : (
        <AddonsList
          searchQuery={searchQuery}
          filter={filter}
          onSelect={onSelect}
          category={browse?.category}
          onCategoryChange={browse?.setCategory}
        />
      )}
    </ResizablePanelLayout>
  )
}
