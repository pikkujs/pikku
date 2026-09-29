import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { git, isGitRepo } from './git.js'

/**
 * Compares the migration files in the working tree with a base ref, so a
 * migration that already exists on the base branch cannot be edited, deleted
 * or renamed. Adding a new file is always fine.
 *
 * The base is a stand-in for "a migration some stage may already have
 * applied". It is weaker than the control plane's ledger, but it needs no
 * network, no login and no recorded hash, so it also covers rows that predate
 * hash recording.
 */

export const MIGRATIONS_BASE_ENV = 'PIKKU_MIGRATIONS_BASE'

const DEFAULT_BASES = ['origin/main', 'main']

export interface MigrationBaseChange {
  kind: 'modified' | 'deleted' | 'renamed'
  file: string
  /** New name, for a rename. */
  renamedTo?: string
}

export interface MigrationBaseResult {
  /** The ref the working tree was compared with (the merge-base commit). */
  base: string
  /** The ref as the user or default named it. */
  baseName: string
  changes: MigrationBaseChange[]
}

// `git()` trims stdout, so trailing whitespace is not compared.
const norm = (s: string): string => s.replace(/\r\n/g, '\n').trim()

/** Pure comparison, split out so it is testable without git. */
export function diffMigrationSets(
  base: Map<string, string>,
  current: Map<string, string>
): MigrationBaseChange[] {
  const changes: MigrationBaseChange[] = []
  const newFiles = [...current.keys()].filter((f) => !base.has(f))
  const claimed = new Set<string>()
  for (const [file, content] of [...base].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const now = current.get(file)
    if (now === undefined) {
      const twin = newFiles.find(
        (f) => !claimed.has(f) && norm(current.get(f)!) === norm(content)
      )
      if (twin) {
        claimed.add(twin)
        changes.push({ kind: 'renamed', file, renamedTo: twin })
      } else {
        changes.push({ kind: 'deleted', file })
      }
    } else if (norm(now) !== norm(content)) {
      changes.push({ kind: 'modified', file })
    }
  }
  return changes
}

async function resolves(ref: string, cwd: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
    return true
  } catch {
    return false
  }
}

/**
 * Returns null when there is nothing to compare against (not a git repo, no
 * base ref, base has no migrations dir). Never throws for git problems.
 * `explicitBase` set but unresolvable is reported by `unresolvedBase`.
 */
export async function compareMigrationsWithBase(
  root: string,
  migrationsDir: string,
  explicitBase?: string
): Promise<
  | { ok: true; result: MigrationBaseResult }
  | { ok: false; unresolvedBase?: string }
> {
  if (!(await isGitRepo(root))) return { ok: false }
  const wanted = explicitBase || process.env[MIGRATIONS_BASE_ENV] || undefined
  let baseName: string | undefined
  for (const candidate of wanted ? [wanted] : DEFAULT_BASES) {
    if (await resolves(candidate, root)) {
      baseName = candidate
      break
    }
  }
  if (!baseName) return { ok: false, unresolvedBase: wanted }

  // The branch's merge-base, so a migration added to the base after this
  // branch left it is not mistaken for one this branch deleted.
  let base = baseName
  try {
    base = await git(['merge-base', 'HEAD', baseName], root)
  } catch {
    // unrelated histories or no HEAD yet: compare with the ref itself
  }

  // Paths are given relative to `root` (`./`), so a project below the
  // repository root works and no realpath juggling is needed.
  const rel = `./${migrationsDir.slice(root.length + 1).replace(/\\/g, '/')}`
  let listing: string
  try {
    listing = await git(['ls-tree', '--name-only', base, `${rel}/`], root)
  } catch {
    return { ok: false }
  }
  const baseFiles = new Map<string, string>()
  for (const line of listing.split('\n').filter(Boolean)) {
    const name = line.split('/').pop()!
    if (!name.endsWith('.sql')) continue
    try {
      baseFiles.set(name, await git(['show', `${base}:${rel}/${name}`], root))
    } catch {
      // unreadable blob: leave it out rather than guess
    }
  }
  if (baseFiles.size === 0) return { ok: false }

  const current = new Map<string, string>()
  for (const f of (await readdir(migrationsDir)).filter((f) =>
    f.endsWith('.sql')
  )) {
    current.set(f, await readFile(join(migrationsDir, f), 'utf8'))
  }
  return {
    ok: true,
    result: {
      base,
      baseName,
      changes: diffMigrationSets(baseFiles, current),
    },
  }
}
