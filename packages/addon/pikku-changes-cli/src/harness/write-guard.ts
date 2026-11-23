import { HarnessInfraError } from './finding.js'
import { gitIn } from './git.js'

export const DEFAULT_WRITES = ['.pikku/**']

/**
 * A glob over repository-relative paths: `**` spans directories (`a/**` and `**\/b` included), `*`
 * and `?` stay inside one segment, `{x,y}` is a choice. A leading `./` is ignored.
 */
export const globToRegExp = (glob: string): RegExp => {
  const source = glob.replace(/^\.\//, '')
  let out = ''
  let braces = 0
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!
    if (char === '*' && source[i + 1] === '*') {
      const before = i === 0 || source[i - 1] === '/'
      const after = source[i + 2] === '/'
      const end = i + 2 === source.length
      if (before && after) {
        out += '(?:.*/)?'
        i += 2
      } else if (before && end) {
        out += '.*'
        i += 1
      } else {
        out += '[^/]*'
        i += 1
      }
    } else if (char === '*') out += '[^/]*'
    else if (char === '?') out += '[^/]'
    else if (char === '{') {
      braces++
      out += '(?:'
    } else if (char === '}' && braces) {
      braces--
      out += ')'
    } else if (char === ',' && braces) out += '|'
    else out += char.replace(/[.+^$|()[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

export const allowedBy = (writes: string[]) => {
  const patterns = writes.map(globToRegExp)
  return (path: string) => patterns.some((pattern) => pattern.test(path))
}

/** Every dirty or untracked path of a worktree, with its status and the hash of what is on disk. */
export type TreeSnapshot = Map<string, string>

const porcelainPaths = (porcelain: string): Map<string, string> => {
  const entries = new Map<string, string>()
  const fields = porcelain.split('\0')
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    if (field.length < 4) continue
    const status = field.slice(0, 2)
    entries.set(field.slice(3), status)
    // a rename or copy is followed by its source path, which changed too
    if (status[0] === 'R' || status[0] === 'C') {
      const from = fields[++i]
      if (from) entries.set(from, `${status[0]}<`)
    }
  }
  return entries
}

/** Taken before a gate runs and again after; ignored files are not part of it. */
export const snapshotTree = async (
  worktree: string,
  gitBinary?: string
): Promise<TreeSnapshot> => {
  const git = gitIn(worktree, gitBinary)
  const entries = porcelainPaths(
    await git(['status', '--porcelain=v1', '-z', '-uall'])
  )
  // a deleted path, the source of a rename and a nested repository have no file to hash
  const present = [...entries.keys()].filter((path) => {
    const status = entries.get(path)!
    return !status.includes('D') && status[1] !== '<' && !path.endsWith('/')
  })
  const hashes = present.length
    ? (await git(['hash-object', '--stdin-paths'], `${present.join('\n')}\n`))
        .trim()
        .split('\n')
    : []
  const byPath = new Map(present.map((path, i) => [path, hashes[i]!]))
  const snapshot: TreeSnapshot = new Map()
  for (const [path, status] of entries)
    snapshot.set(path, `${status} ${byPath.get(path) ?? 'deleted'}`)
  return snapshot
}

export const changedPaths = (
  before: TreeSnapshot,
  after: TreeSnapshot
): string[] =>
  [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort()

/**
 * Compares the worktree with the snapshot taken before a gate ran. A change outside `writes` is an
 * infra error naming the paths; otherwise the changed paths (all inside `writes`) are returned.
 */
export const guardWrites = async ({
  worktree,
  before,
  writes = DEFAULT_WRITES,
  gate,
  gitBinary,
}: {
  worktree: string
  before: TreeSnapshot
  writes?: string[]
  gate: string
  gitBinary?: string
}): Promise<string[]> => {
  const changed = changedPaths(before, await snapshotTree(worktree, gitBinary))
  const allowed = allowedBy(writes)
  const outside = changed.filter((path) => !allowed(path))
  if (outside.length)
    throw new HarnessInfraError(
      'write-outside-allowlist',
      `Gate ${gate} changed ${outside.length} path(s) outside ${writes.join(', ')}: ${outside.slice(0, 20).join(', ')}${outside.length > 20 ? ', …' : ''}`
    )
  return changed
}
