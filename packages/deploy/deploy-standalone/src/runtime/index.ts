/**
 * `@pikku/deploy-standalone/runtime` — the sliver of this package that runs
 * inside the shipped artifact rather than on the build machine.
 *
 * A generated standalone entry imports from here, so the code is unit-tested
 * in TypeScript instead of being a string the adapter emits and nobody runs.
 */
export {
  DATA_DIR_ENV,
  PARENT_PID_ENV,
  watchParentProcess,
} from './parent-watch.js'
export type { ParentWatch, ParentWatchOptions } from './parent-watch.js'
