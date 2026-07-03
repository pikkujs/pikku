import type * as NodeFs from 'node:fs'
import type * as NodeFsPromises from 'node:fs/promises'
import type * as NodeChildProcess from 'node:child_process'

/**
 * Lazy access to node builtins that Cloudflare Workers cannot resolve
 * (`node:fs`, `node:fs/promises`, `node:child_process`). Console addon
 * functions ship inside deploy bundles, and a static import of any of these
 * fails CF upload validation with `No such module "node:fs"`. These functions
 * only ever execute in the sandbox/dev server (real Node ≥22), where
 * `process.getBuiltinModule` resolves them at call time. (The type-only
 * imports above are erased at compile time, so no runtime import remains.)
 */
export const nodeFs = () =>
  process.getBuiltinModule('node:fs') as typeof NodeFs

export const nodeFsPromises = () =>
  process.getBuiltinModule('node:fs/promises') as typeof NodeFsPromises

export const nodeChildProcess = () =>
  process.getBuiltinModule('node:child_process') as typeof NodeChildProcess
