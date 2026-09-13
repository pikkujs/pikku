import { pikkuFunc } from '#pikku/addon/function'
import { requireFlagStore } from '../lib/require-flag-store.js'

export const flagSync = pikkuFunc<null, { synced: number }>({
  title: 'Create Rows for Declared Feature Flags',
  description:
    'Registers every flag the running app declares that the store has never heard of. An unbacked flag resolves as available for everyone, so this is how a dark launch is actually held dark.',
  expose: true,
  scopes: ['admin:flags:manage'],
  func: async ({ featureFlags }) => {
    const store = requireFlagStore(featureFlags)
    // The running app's own declarations, not a list from the caller: a client
    // that could name the flags to create could create one nothing declares,
    // which is the drift this exists to clear.
    const declared = store.declaredFlags?.() ?? []
    if (declared.length === 0) {
      return { synced: 0 }
    }
    await store.syncFlags([...declared])
    return { synced: declared.length }
  },
})
