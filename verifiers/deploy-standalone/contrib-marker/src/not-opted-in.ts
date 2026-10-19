import type { Contributor } from '@pikku/core/contributors'

/** Registered but not opted in to by the verifier project: it must never reach the bundle. */
export const notOptedInDeploy: Contributor = {
  provides: ['neverBundled'],
  run: (services) => {
    services.neverBundled = 'NEVER_BUNDLED_MARKER'
  },
}
