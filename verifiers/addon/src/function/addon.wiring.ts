/**
 * Wires contracts published by the addon package across the package boundary
 * using refHTTP / refChannel / refCLI — the addon's source is never imported.
 * Each reference resolves the addon's published contract metadata (loaded via
 * wireAddon) and proxies every function through ref() at runtime, while the
 * inspector tags the resulting wirings with the originating packageName.
 */

import {
  refHTTP,
  refChannel,
  refCLI,
  ref,
  wireHTTPRoutes,
  wireChannel,
  wireCLI,
} from '#pikku'
import { defineHTTPRoutes } from '#pikku/http/pikku-http-types.gen.js'

wireHTTPRoutes({
  basePath: '/api',
  routes: { ext: refHTTP('ext:helloRoutes') },
})

/**
 * The other half of the addon HTTP story: a route this package shapes itself,
 * pointed at an addon function through `ref()`. Unlike refHTTP — which adopts
 * the addon's published route contract wholesale — the contract here has to be
 * recovered from the addon's function metadata, and that is what regressed: a
 * cold run (no `.pikku` yet) had nothing to resolve `ref('ext:goodbye')`
 * against and widened the input to the whole RPC map. The types asserted in
 * contracts.types.assert.ts are the check.
 */
export const localRoutes = defineHTTPRoutes({
  basePath: '/local',
  routes: {
    goodbye: { method: 'get', route: '/goodbye', func: ref('ext:goodbye') },
  },
})

wireHTTPRoutes({ basePath: '/api', routes: { local: localRoutes } })

wireChannel({
  name: 'ext-events',
  route: '/ext',
  auth: false,
  onMessageWiring: { action: refChannel('ext:helloChannel') },
})

wireCLI({ program: 'addon-cli', commands: { ...refCLI('ext:helloCommands') } })
