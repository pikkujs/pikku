import { pikkuFunc } from '#pikku/addon/function'
import type { FlagOverrideRow } from '@pikku/core/services'
import { asFlagStore } from '../lib/flag-store.js'

export const flagOverrides = pikkuFunc<
  { name: string },
  { overrides: FlagOverrideRow[]; supported: boolean }
>({
  title: 'List a Feature Flag’s Overrides',
  description:
    'Lists every organization and user pinned on or off for one flag, ahead of its rollout.',
  expose: true,
  scopes: ['admin:flags:read'],
  func: async ({ featureFlags }, { name }) => {
    const store = asFlagStore(featureFlags)
    // A provider owns its own overrides and does not publish them through the
    // read interface. Saying so beats an empty list, which a screen would
    // render as "nobody is overridden" — the opposite of the truth.
    if (!store) {
      return { overrides: [], supported: false }
    }
    return { overrides: await store.listOverrides(name), supported: true }
  },
})
