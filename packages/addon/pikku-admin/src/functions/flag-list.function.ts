import { pikkuFunc } from '#pikku/addon/function'
import type { FlagRow } from '@pikku/core/services'
import { asFlagStore } from '../lib/flag-store.js'

export const flagList = pikkuFunc<
  null,
  { flags: FlagRow[]; writable: boolean }
>({
  title: 'List Feature Flags',
  description:
    'Lists every feature flag in the store, with its rollout, overrides and whether it is still declared in code.',
  expose: true,
  scopes: ['admin:flags:read'],
  func: async ({ featureFlags }) => {
    const store = asFlagStore(featureFlags)
    if (!store) {
      // A provider-backed source, or none wired at all. Reported rather than
      // thrown: the tab renders what there is and disables its switches, which
      // is the honest answer for flags whose operator surface is PostHog's.
      return { flags: [], writable: false }
    }
    const flags = await store.listFlags()
    return {
      flags: flags.sort((a, b) => a.name.localeCompare(b.name)),
      writable: true,
    }
  },
})
