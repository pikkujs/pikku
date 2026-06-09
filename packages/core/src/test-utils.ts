import { getAllPackageStates } from './pikku-state.js'
import { clearMiddlewareCache } from './middleware-runner.js'
import { clearPermissionsCache } from './permissions.js'
import { clearChannelMiddlewareCache } from './wirings/channel/channel-middleware-runner.js'

/**
 * Clears all runtime caches between test scenarios without touching registered
 * routes, functions, or middleware groups (which are set at module load time
 * and must persist for the whole test run).
 *
 * Call this alongside your DB snapshot restore in your Before hook:
 *
 * ```typescript
 * Before(async function() {
 *   await restoreSnapshot()
 *   clearPikkuRuntimeState()
 *   setSingletonServices(bundle.services)
 * })
 * ```
 *
 * Only works when NODE_ENV === 'test'. Logs an error and returns otherwise.
 */
export const clearPikkuRuntimeState = (): void => {
  if (process.env.NODE_ENV !== 'test') {
    console.error(
      '[pikku] clearPikkuRuntimeState() must only be called in test environments. Ignoring.'
    )
    return
  }

  clearMiddlewareCache()
  clearPermissionsCache()
  clearChannelMiddlewareCache()

  for (const packageState of getAllPackageStates().values()) {
    packageState.package.singletonServices = null
  }
}
