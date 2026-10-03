import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/** Thrown when a requested path would leave the workspace root. */
export class WorkspacePathError extends Error {}

const inside = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const realpathOfNearest = (target: string): string => {
  let dir = target
  const rest: string[] = []
  while (true) {
    try {
      return resolve(realpathSync(dir), ...rest.reverse())
    } catch {
      const parent = dirname(dir)
      if (parent === dir) return target
      rest.push(dir.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)))
      dir = parent
    }
  }
}

/** Resolves a workspace-relative path (a leading `/` means the root) and rejects anything outside it, symlinks included. */
export function resolveWorkspacePath(
  root: string,
  requested: string
): { abs: string; rel: string } {
  if (requested.includes('\0'))
    throw new WorkspacePathError('path contains a NUL byte')
  const base = resolve(root)
  const abs = resolve(base, requested.replace(/^[/\\]+/, ''))
  if (!inside(base, abs))
    throw new WorkspacePathError('path escapes the workspace')
  if (!inside(realpathOfNearest(base), realpathOfNearest(abs)))
    throw new WorkspacePathError('path escapes the workspace through a symlink')
  const rel = relative(base, abs).split(sep).join('/')
  if (rel === '.git' || rel.startsWith('.git/'))
    throw new WorkspacePathError('path is inside .git')
  return { abs, rel }
}
