/**
 * The HTTP face of {@link DataLock}: the routes an unlock screen talks to.
 *
 * Separate from `@pikku/core/classification` on purpose — that entry point is
 * types and crypto, and a runtime that never serves HTTP should not have to
 * load a router to use it.
 */
export { wireDataLock } from './data-lock-wiring.js'
export type {
  DataLockStatus,
  DataLockWiringOptions,
} from './data-lock-wiring.js'
