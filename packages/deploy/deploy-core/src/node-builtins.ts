import { builtinModules } from 'node:module'

/** What Bun adds to `builtinModules` that Node does not build in. */
const BUN_ONLY = new Set(['bun', 'undici', 'ws'])

/** Node's own built-ins, whichever runtime the build runs on. */
export const NODE_BUILTIN_MODULES: readonly string[] = builtinModules.filter(
  (name) => !BUN_ONLY.has(name) && !name.startsWith('bun:')
)

/**
 * esbuild externals covering every Node.js builtin, under both spellings.
 *
 * `node:*` alone is not enough: a dependency compiled to CJS requires the bare
 * name (`require('buffer')`), which esbuild resolves and bundles rather than
 * leaving external. Both forms are emitted so either import style resolves to
 * the runtime's own module.
 *
 * The list comes from the running Node so it cannot fall behind the runtime —
 * a hand-written array silently stops covering builtins added since it was
 * typed, and the missing ones get bundled instead.
 */
export const nodeBuiltinExternals = (...extra: string[]): string[] => [
  'node:*',
  ...NODE_BUILTIN_MODULES,
  ...extra,
]
