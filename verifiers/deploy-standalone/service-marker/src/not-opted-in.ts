import { pikkuService } from '@pikku/core/pikku-service'

/** Declared but not opted in to by the verifier project: it must never reach the bundle. */
export const notOptedIn = pikkuService({
  common: () => ({ neverBundled: 'NEVER_BUNDLED_MARKER' }),
})
