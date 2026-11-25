import { defineProvider } from '@pikku/core/provider'

/** Declared but not opted in to by the verifier project: it must never reach the bundle. */
export const notOptedIn = defineProvider({
  common: () => ({ neverBundled: 'NEVER_BUNDLED_MARKER' }),
})
