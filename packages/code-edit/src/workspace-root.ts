import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The nearest ancestor of `projectRoot` whose package.json declares `workspaces`, else `projectRoot`. */
export function findWorkspaceRoot(projectRoot: string): string {
  let dir = projectRoot
  while (true) {
    try {
      if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')).workspaces) return dir
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) return projectRoot
    dir = parent
  }
}
