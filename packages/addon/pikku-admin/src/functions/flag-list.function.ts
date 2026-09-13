import { pikkuFunc } from '#pikku/addon/function'
import { asFlagStore } from '../lib/flag-store.js'
import {
  flagRowsFromSource,
  sortFlagRows,
  type FlagListRow,
} from '../lib/flag-rows.js'

export const flagList = pikkuFunc<
  null,
  { flags: FlagListRow[]; writable: boolean }
>({
  title: 'List Feature Flags',
  description:
    'Lists every declared feature flag with its rollout, whether it is still declared in code, and whether the backing store holds a row for it.',
  expose: true,
  scopes: ['admin:flags:read'],
  func: async ({ featureFlags }) => {
    const store = asFlagStore(featureFlags)
    if (store) {
      const flags = await store.listFlags()
      return {
        flags: sortFlagRows(flags.map((flag) => ({ ...flag, backed: true }))),
        writable: true,
      }
    }

    if (!featureFlags) {
      return { flags: [], writable: false }
    }

    // A provider-backed source: read-only rather than throwing, because its own
    // UI is the operator surface and a console of switches that 500 is worse
    // than a tab that reads.
    return {
      flags: flagRowsFromSource(
        featureFlags.declaredFlags?.() ?? [],
        await featureFlags.snapshot()
      ),
      writable: false,
    }
  },
})
