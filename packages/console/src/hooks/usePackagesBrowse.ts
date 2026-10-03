import { useCallback, useState } from 'react'
import { useAddonCategories } from './useAddonCategories'
import { useOpenapiCategories } from './useOpenapiCategories'
import type { CategoryBucket } from '../components/packages/addonCategoryMeta'

export type PackagesTab = 'addons' | 'apis'

export interface PackagesBrowse {
  tab: PackagesTab
  setTab: (tab: PackagesTab) => void
  category: string
  setCategory: (category: string) => void
  /** Buckets for whichever catalogue the active tab is showing. */
  categories: CategoryBucket[]
  /** Size of that catalogue, unfiltered — the rail's "All" count. */
  catalogueTotal: number
}

/**
 * The browse state `PackagesListPanel` normally keeps to itself — which
 * catalogue is showing and which category is picked, plus that catalogue's
 * buckets. Hoist it here and the rail can be mounted as its own surface (a
 * host's side panel, a phone sheet) with `PackagesBrowseRail`, then handed back
 * to `PackagesListPanel` via its `browse` prop so both drive one state.
 *
 * Switching tabs resets the category: the two catalogues have separate category
 * vocabularies, so carrying an addon category into the API list would filter it
 * to nothing with no visible reason why.
 */
export const usePackagesBrowse = (): PackagesBrowse => {
  const [tab, setTabState] = useState<PackagesTab>('addons')
  const [category, setCategory] = useState('all')

  const addons = useAddonCategories(tab === 'addons')
  const apis = useOpenapiCategories(tab === 'apis')
  const active = tab === 'apis' ? apis : addons

  const setTab = useCallback((next: PackagesTab) => {
    setTabState(next)
    setCategory('all')
  }, [])

  return {
    tab,
    setTab,
    category,
    setCategory,
    categories: active.categories,
    catalogueTotal: active.catalogueTotal,
  }
}
