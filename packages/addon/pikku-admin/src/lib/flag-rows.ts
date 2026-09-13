import type { DeclaredFlag, FlagConfigSnapshot } from '@pikku/core/flag'
import type { FlagRow } from '@pikku/core/services'

/**
 * `backed` is false for a flag declared in code that the backing store has
 * never heard of. It resolves as available for everyone — an absent row fails
 * open — so a dark launch nobody created in the provider is already live, and
 * this is the only place that says so.
 */
export type FlagListRow = FlagRow & { backed: boolean }

const byName = (a: FlagListRow, b: FlagListRow) => a.name.localeCompare(b.name)

export const sortFlagRows = (rows: FlagListRow[]): FlagListRow[] =>
  rows.sort(byName)

/**
 * The declared set joined onto a provider's snapshot.
 *
 * The declaration leads rather than the snapshot: a flag the provider holds and
 * code does not declare can never be read — no `featureFlag:` names it and the
 * client map is built from the declarations — so listing it would offer an
 * operator a switch that changes nothing.
 */
export const flagRowsFromSource = (
  declared: readonly DeclaredFlag[],
  snapshot: FlagConfigSnapshot
): FlagListRow[] =>
  sortFlagRows(
    declared.map((flag) => {
      const row = snapshot[flag.name]
      return {
        ...flag,
        enabled: row?.enabled ?? true,
        rolloutPercent: row?.rolloutPercent ?? null,
        declared: true,
        backed: row !== undefined,
      }
    })
  )
