import { pikkuFunc } from '#pikku/addon/function'
import type { FlagSubject } from '@pikku/core/flag'
import { requireFlagStore } from '../lib/require-flag-store.js'

export const flagClearOverride = pikkuFunc<
  { name: string; subject: FlagSubject },
  { success: boolean }
>({
  title: 'Clear a Feature Flag Override',
  description:
    'Returns one subject to the flag it would otherwise resolve to. Not the same as overriding it to false, which keeps the subject pinned off through a later rollout.',
  expose: true,
  scopes: ['admin:flags:manage'],
  func: async ({ featureFlags }, { name, subject }) => {
    await requireFlagStore(featureFlags).clearOverride(name, subject)
    return { success: true }
  },
})
