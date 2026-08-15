export { pikkuDevReloader } from '../dev/hot-reload.js'
export {
  reconcileAddonRegistry,
  reloadGeneratedMeta,
} from '../dev/reload-meta.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { ReloadGeneratedMetaOptions } from '../dev/reload-meta.js'
export type { Logger } from '../services/logger.js'
