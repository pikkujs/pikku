import { dirname, join } from 'node:path'
import { nodeFs } from './node-builtins.js'

/**
 * Resolve a project's functions directory from the MetaService basePath.
 *
 * For a normal pikku console, basePath is the project's outDir (e.g.
 * `packages/functions/.pikku`), so `dirname(basePath)` already IS the functions
 * dir. In the Fabric sandbox the meta service reports the workspace-root
 * `.pikku`, so we fall back to `<root>/packages/functions` when it exists —
 * keeping `pikku tests init`, the coverage output and the run handlers all
 * anchored on the same directory regardless of layout.
 */
export function resolveFunctionsDir(basePath: string): string {
  const root = dirname(basePath)
  const monorepo = join(root, 'packages', 'functions')
  return nodeFs().existsSync(monorepo) ? monorepo : root
}

/** Path to the `function-coverage.json` the function-tests harness writes. */
export function functionCoveragePath(basePath: string): string {
  return join(
    resolveFunctionsDir(basePath),
    'tests',
    '.coverage',
    'function-coverage.json'
  )
}
