/**
 * @pikku/deploy-standalone — Standalone deploy adapter for Pikku.
 *
 * Bundles the entire project into a single unit and ships it as a
 * self-contained executable compiled with `bun build --compile`
 * (`@pikku/bun-server`).
 */

import {
  StandaloneProviderAdapter,
  type StandaloneProviderAdapterOptions,
} from './adapter.js'

export { StandaloneProviderAdapter }
export type { StandaloneProviderAdapterOptions } from './adapter.js'
export type { PlatformServiceContributor } from '@pikku/deploy'

export const createAdapter = (options?: StandaloneProviderAdapterOptions) =>
  new StandaloneProviderAdapter(options)
