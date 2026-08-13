import type { FeaturesMeta } from '@pikku/core/scenario'
import type { InspectorFeature } from '@pikku/inspector'

/**
 * The feature meta the console reads, built from what the inspector could read
 * off the source.
 *
 * Entry order is the declared order and is deliberately not sorted — a
 * feature's scenarios read top to bottom the way they were written, the same
 * way a gherkin Feature file does.
 *
 * The source path is dropped: it is absolute to the machine that generated the
 * meta, and nothing rendering a feature needs it.
 */
export const buildFeaturesMeta = (
  featureFiles: Map<string, InspectorFeature>
): FeaturesMeta => {
  const meta: FeaturesMeta = {}

  for (const [id, feature] of featureFiles) {
    meta[id] = {
      id,
      name: feature.name ?? id,
      ...(feature.description ? { description: feature.description } : {}),
      tags: feature.tags ?? [],
      entries: feature.entries.map((entry) =>
        entry.data === undefined
          ? { scenario: entry.scenario }
          : { scenario: entry.scenario, data: entry.data }
      ),
      unresolvedEntries: feature.unresolvedEntries,
      hasBefore: feature.hasBefore,
      hasAfter: feature.hasAfter,
    }
  }

  return meta
}
