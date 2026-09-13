import { pikkuFunc } from '#pikku/addon/function'
import { requireFlagStore } from '../lib/require-flag-store.js'

export const flagSetEnabled = pikkuFunc<
  { name: string; enabled: boolean; note?: string },
  { success: boolean }
>({
  title: 'Switch a Feature Flag',
  description:
    'Turns a feature off for everyone, or back on. Takes effect within the source cache TTL, without a deploy.',
  expose: true,
  scopes: ['admin:flags:manage'],
  func: async ({ featureFlags }, { name, enabled, note }, { session }) => {
    await requireFlagStore(featureFlags).setEnabled(
      name,
      enabled,
      session?.userId,
      note
    )
    return { success: true }
  },
})
