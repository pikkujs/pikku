import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import {
  buildScenarioDocs,
  type FeatureDoc,
  type ScenarioDocs,
} from '../components/scenarios/scenario-doc-model'

/** The id the ungrouped bucket is addressed by; not a real feature. */
export const UNGROUPED_FEATURE_ID = '__ungrouped'

export interface ScenarioDocsResult extends ScenarioDocs {
  /**
   * Features plus, when there are any, a synthetic feature holding scenarios
   * that no feature declares — so the navigator and the document can treat
   * both the same way.
   */
  allFeatures: FeatureDoc[]
  loading: boolean
}

/**
 * The scenario section's document model, read straight from project meta.
 *
 * `ungroupedName` is passed in rather than resolved here so the hook stays
 * free of message imports and remains usable by host apps with their own
 * locale setup.
 */
export function useScenarioDocs(ungroupedName: string): ScenarioDocsResult {
  const { meta, loading } = usePikkuMeta()

  const docs = useMemo(
    () =>
      buildScenarioDocs({
        workflows: meta.workflows as Record<string, unknown> | undefined,
        features: (meta as { features?: Record<string, unknown> }).features,
      }),
    [meta]
  )

  const allFeatures = useMemo(() => {
    if (docs.ungrouped.length === 0) return docs.features
    return [
      ...docs.features,
      {
        id: UNGROUPED_FEATURE_ID,
        name: ungroupedName,
        tags: [],
        hasBefore: false,
        hasAfter: false,
        unresolvedEntries: 0,
        scenarios: docs.ungrouped.map((scenario) => ({ scenario })),
      },
    ]
  }, [docs, ungroupedName])

  return { ...docs, allFeatures, loading }
}
