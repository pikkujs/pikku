/**
 * @pikku/deploy-standalone — Standalone binary adapter for Pikku.
 *
 * Bundles the entire project into a single executable via @yao-pkg/pkg.
 * Includes uWebSockets.js server, in-process scheduler, and platform-specific native modules.
 */

import { StandaloneProviderAdapter } from './adapter.js'

export { StandaloneProviderAdapter }

export const createAdapter = () => new StandaloneProviderAdapter()
