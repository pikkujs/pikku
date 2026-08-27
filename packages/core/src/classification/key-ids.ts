import type { ClassificationManifest } from './data-classification.js'

/** The key a column protects itself with when it names none. */
export const DEFAULT_KEY_ID = 'default'

/**
 * Every key the manifest expects to exist, sorted.
 *
 * Feed it straight to `DataLock.initialize` rather than listing keys by hand:
 * a keyId a column names but nobody initialized does not fail at startup, it
 * fails at the first write to that one column — which can be a long way from
 * the deploy that introduced it, in a code path nobody exercised yet.
 *
 * Only `wrapped` and `sealed` contribute. A `hashed` column is a lookup key,
 * so encrypting it would break the lookup it exists for.
 */
export const keyIdsFromManifest = (
  manifest: ClassificationManifest
): string[] => {
  const keyIds = new Set<string>()
  for (const columns of Object.values(manifest.tables)) {
    for (const column of Object.values(columns)) {
      if (column.form === 'wrapped' || column.form === 'sealed') {
        keyIds.add(column.keyId ?? DEFAULT_KEY_ID)
      }
    }
  }
  return [...keyIds].sort()
}
