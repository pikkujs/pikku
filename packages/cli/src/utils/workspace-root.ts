import { readFileSync } from 'fs'
import { dirname, join } from 'path'

/** The nearest ancestor of `rootDir` whose package.json declares `workspaces`, else `rootDir`. */
export function workspaceRoot(rootDir: string): string {
  let dir = rootDir
  while (true) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
      if (pkg.workspaces) return dir
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) return rootDir
    dir = parent
  }
}
