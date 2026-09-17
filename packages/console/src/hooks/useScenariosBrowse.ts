import { useMemo, useState } from 'react'
import { m } from '@/i18n/messages'
import { useScenarioDocs } from './useScenarioDocs'
import { filterFeatures } from '../components/scenarios/scenario-doc-model'
import { ALL_FEATURES } from '../components/scenarios/FeatureNavigator'
import type { FeatureDoc } from '../components/scenarios/scenario-doc-model'

export interface ScenariosBrowse {
  /** Features after the search and tag filters — what the rail lists. */
  features: FeatureDoc[]
  /** Every tag in the catalogue, for the filter in the page header. */
  tags: string[]
  selectedTags: string[]
  setSelectedTags: (tags: string[]) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectedId: string
  setSelectedId: (id: string) => void
  /** The feature the document shows, or `undefined` while the whole suite is
   *  being read — which is where the screen opens. A picked feature that the
   *  filters remove falls back to the whole suite rather than to some other
   *  feature the reader never chose. */
  selected: FeatureDoc | undefined
  loading: boolean
}

/**
 * The browse state `ScenariosWorkspace` normally keeps to itself — the search
 * text, the tag filter and which feature is picked, plus the filtered list they
 * produce. Hoist it here and the feature rail can be mounted as its own surface
 * (a host's side panel, a phone sheet) with `ScenariosBrowseRail`, then handed
 * back to `ScenariosPage` via its `browse` prop so both drive one state.
 *
 * Mounting the rail apart costs no extra request: `useScenarioDocs` is keyed
 * query state, so the second caller reads the first one's cache.
 */
export const useScenariosBrowse = (): ScenariosBrowse => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string>(ALL_FEATURES)

  const { allFeatures, tags, loading } = useScenarioDocs(
    m.scenarios_ungrouped()
  )

  const features = useMemo(
    () =>
      filterFeatures(allFeatures, { query: searchQuery, tags: selectedTags }),
    [allFeatures, searchQuery, selectedTags]
  )

  const selected = features.find((feature) => feature.id === selectedId)

  return {
    features,
    tags,
    selectedTags,
    setSelectedTags,
    searchQuery,
    setSearchQuery,
    selectedId,
    setSelectedId,
    selected,
    loading,
  }
}
