import { builtinModules } from 'node:module'

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
  ...builtinModules,
  ...extra,
]
