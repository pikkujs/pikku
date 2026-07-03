import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Resolve the project root (the directory containing pikku.config.json) from
 * the MetaService basePath. For a flat pikku project, dirname(basePath) IS
 * the root. In a monorepo layout (e.g. the Fabric sandbox, where basePath is
 * `packages/functions/.pikku`), pikku.config.json lives further up — walk up
 * until we find it, matching the CLI's own findConfigFile() behavior.
 */
export function findProjectRoot(basePath: string): string {
  let dir = dirname(basePath)
  while (true) {
    if (existsSync(`${dir}/pikku.config.json`)) return dir
    const parent = dirname(dir)
    if (parent === dir) return dirname(basePath)
    dir = parent
  }
}
