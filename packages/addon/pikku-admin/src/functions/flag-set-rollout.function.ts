import { pikkuFunc } from '#pikku/addon/function'
import { requireFlagStore } from '../lib/require-flag-store.js'

export const flagSetRollout = pikkuFunc<
  { name: string; percent: number | null },
  { success: boolean }
>({
  title: 'Set a Feature Flag Rollout',
  description:
    'Admits a percentage of subjects to a flag, or null to drop the constraint. A subject stays in or out across requests — the bucket is hashed from the flag and the subject, never sampled.',
  expose: true,
  scopes: ['admin:flags:manage'],
  func: async ({ featureFlags }, { name, percent }, { session }) => {
    if (percent !== null && (percent < 0 || percent > 100)) {
      throw new Error('A rollout percentage is 0–100, or null for no rollout')
    }
    await requireFlagStore(featureFlags).setRollout(
      name,
      percent,
      session?.userId
    )
    return { success: true }
  },
})
