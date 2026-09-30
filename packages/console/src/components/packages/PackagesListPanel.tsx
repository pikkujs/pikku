import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { ListPageHeader } from '../layout/PageLayout'
import type { ShellHeaderFilter } from '../ui/shellHeaderShared'
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

  const handleTabChange = (value: PackagesTab) => {
    setSearchQuery('')
    if (browse) browse.setTab(value)
    else setOwnTab(value)
  }

  const headerFilters: ShellHeaderFilter[] =
    tab === 'addons'
      ? [
          {
            key: 'show',
            label: m.integrations_filter_label(),
            value: filter,
            priority: 2,
            onChange: (value) => setFilter(value as AddonFilter),
            options: [
              { value: 'all', label: m.integrations_show_all() },
              { value: 'official', label: m.integrations_made_by_fabric() },
              { value: 'installed', label: m.integrations_in_app_title() },
            ],
          },
        ]
      : []

  return (
    <ResizablePanelLayout
      surface="cards"
      header={
        <ListPageHeader<PackagesTab>
          title={m.integrations_title()}
          description={m.integrations_description()}
          selection={{
            ariaLabel: m.integrations_kind_label(),
            value: tab,
            onChange: handleTabChange,
            options: [
              { value: 'addons', label: m.integrations_tab_services() },
              { value: 'apis', label: m.integrations_tab_apis() },
            ],
          }}
          headerFilters={headerFilters}
        />
      }
    >
      {tab === 'apis' ? (
        <ApisList
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          category={browse?.category}
          onCategoryChange={browse?.setCategory}
        />
      ) : (
        <AddonsList
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filter={filter}
          onSelect={onSelect}
          category={browse?.category}
          onCategoryChange={browse?.setCategory}
        />
      )}
    </ResizablePanelLayout>
  )
}
