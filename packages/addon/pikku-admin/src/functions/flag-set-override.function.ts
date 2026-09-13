import { pikkuFunc } from '#pikku/addon/function'
import type { FlagSubject } from '@pikku/core/flag'
import { requireFlagStore } from '../lib/require-flag-store.js'

export const flagSetOverride = pikkuFunc<
  { name: string; subject: FlagSubject; enabled: boolean },
  { success: boolean }
>({
  title: 'Override a Feature Flag',
  description:
    'Forces a flag on or off for one organization or user, ahead of the rollout. This is how "off for everyone except these three" stays one row rather than a fan-out.',
  expose: true,
  scopes: ['admin:flags:manage'],
  func: async ({ featureFlags }, { name, subject, enabled }, { session }) => {
    await requireFlagStore(featureFlags).setOverride(
      name,
      subject,
      enabled,
      session?.userId
    )
    return { success: true }
  },
})
