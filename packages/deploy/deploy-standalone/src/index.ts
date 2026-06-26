/**
 * @pikku/deploy-standalone — Standalone deploy adapter for Pikku.
 *
 * Bundles the entire project into a single unit and ships it as either:
 * - `node` (default): a `bundle.js` run with `node bundle.js`
 *   (`@pikku/node-http-server`), or
 * - `bun`: a self-contained executable compiled with `bun build --compile`
 *   (`@pikku/bun-server`).
 *
 * The runtime is chosen via `pikku deploy --provider standalone --runtime <node|bun>`.
 */

import {
  StandaloneProviderAdapter,
  type StandaloneProviderAdapterOptions,
} from './adapter.js'

export { StandaloneProviderAdapter }
export type {
  StandaloneProviderAdapterOptions,
  StandaloneRuntime,
} from './adapter.js'

export const createAdapter = (options?: StandaloneProviderAdapterOptions) =>
  new StandaloneProviderAdapter(options)
