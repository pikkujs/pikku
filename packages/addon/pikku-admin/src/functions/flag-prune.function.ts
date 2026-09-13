import { pikkuFunc } from '#pikku/addon/function'
import { requireFlagStore } from '../lib/require-flag-store.js'

export const flagPrune = pikkuFunc<null, { pruned: string[] }>({
  title: 'Prune Undeclared Feature Flags',
  description:
    'Removes the flags whose declaration has gone from code, and every override on them. Reports what it deleted, which is never assumed from what was stale a moment earlier.',
  expose: true,
  scopes: ['admin:flags:manage'],
  func: async ({ featureFlags }) => {
    return { pruned: await requireFlagStore(featureFlags).pruneFlags() }
  },
})
