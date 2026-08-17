import type { SurfaceUsageCounts } from '@pikku/inspector'

import type { SurfaceDoc, SurfaceUsage } from './surface-doc.types.js'

export type MergeSurfaceUsageOptions = {
  /** Counted by the inspector during the sweep it already makes. */
  counts: SurfaceUsageCounts
  /**
   * Seeds the result, so an export nothing imports is reported as `imports: 0`
   * rather than being absent. Without it only what was seen is reported.
   */
  doc?: SurfaceDoc
}

/**
 * The per-project overlay: the inspector's raw counters, seeded with every
 * export the shipped doc describes and given a stable ordering.
 */
export const mergeSurfaceUsage = ({
  counts,
  doc,
}: MergeSurfaceUsageOptions): SurfaceUsage => {
  const bySpecifier: SurfaceUsage['bySpecifier'] = {}

  for (const entryPoint of doc?.entryPoints ?? []) {
    for (const leaf of entryPoint.leaves) {
      if (!leaf.specifier.startsWith('#pikku/')) continue
      const symbols = (bySpecifier[leaf.specifier] ??= {})
      for (const symbol of leaf.symbols) {
        symbols[symbol.name] ??= { imports: 0, seenIn: [], files: [] }
      }
    }
  }

  for (const [specifier, symbols] of Object.entries(counts)) {
    const merged = (bySpecifier[specifier] ??= {})
    for (const [name, usage] of Object.entries(symbols)) {
      merged[name] = {
        imports: usage.imports,
        seenIn: [...usage.seenIn].sort(),
        files: [...usage.files].sort(),
      }
    }
  }

  return {
    bySpecifier: Object.fromEntries(
      Object.entries(bySpecifier)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([specifier, symbols]) => [
          specifier,
          Object.fromEntries(
            Object.entries(symbols).sort(([a], [b]) => a.localeCompare(b))
          ),
        ])
    ),
  }
}
