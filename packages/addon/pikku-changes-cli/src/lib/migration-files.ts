import { posix } from 'node:path'

/** Runs git in the checkout being judged and resolves with its stdout. */
export type GitOutput = (args: string[]) => Promise<string>

const CONFIG = 'pikku.config.json'

/** The `rootDir` a config sets, when it sets one as a string; else none (the CLI then uses the config's directory). */
const rootDirOf = (text: string): string | undefined => {
  try {
    const value = (JSON.parse(text) as { rootDir?: unknown }).rootDir
    return typeof value === 'string' && value ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * The roots of the Pikku projects in a checkout, derived as the CLI derives `config.rootDir`: for every tracked
 * `pikku.config.json` in any of `revs` (the base and HEAD, so a project the changeset adds or re-roots counts too),
 * its directory resolved with its `rootDir` field (relative to the config, default `.`). `''` is the repository
 * root; a root outside the repository is left out. `pikku db generate`/`migrate` read `<root>/db/tables.ts` and
 * `<root>/db/<engine>/`.
 */
export const projectRoots = async (
  git: GitOutput,
  revs: string[]
): Promise<string[]> => {
  const roots = new Set<string>()
  for (const rev of new Set(revs)) {
    const listed = await git(['ls-tree', '-r', '--name-only', '-z', rev, '--'])
    for (const path of listed.split('\0')) {
      if (posix.basename(path) !== CONFIG) continue
      const rootDir = rootDirOf(await git(['show', `${rev}:${path}`]))
      const root = posix.normalize(
        posix.join(posix.dirname(path), rootDir ?? '.')
      )
      if (root === '..' || root.startsWith('../') || posix.isAbsolute(root))
        continue
      roots.add(root === '.' ? '' : root.replace(/\/$/, ''))
    }
  }
  return [...roots].sort()
}

const under = (root: string, path: string): string[] | undefined => {
  const prefix = root ? `${root}/` : ''
  return path.startsWith(prefix)
    ? path.slice(prefix.length).split('/')
    : undefined
}

/** A migration of the project at `root`: `<root>/db/<dir>/<file>`. */
export const isMigrationPath = (root: string, path: string): boolean => {
  const rest = under(root, path)
  return !!rest && rest.length === 3 && rest[0] === 'db' && rest.every(Boolean)
}

/** The table declarations of the project at `root`: `<root>/db/tables.ts`. */
export const isTablesPath = (root: string, path: string): boolean => {
  const rest = under(root, path)
  return (
    !!rest && rest.length === 2 && rest[0] === 'db' && rest[1] === 'tables.ts'
  )
}

const clean = (paths: string[]) =>
  paths.map((path) => path.trim()).filter(Boolean)

/**
 * The migrations among `paths` (repository-relative), in their order, judged against the project roots of the
 * checkout at `revs`. Shared by the harness migration gate, its db step and `pikku changes done`.
 */
export const migrationFiles = async (
  git: GitOutput,
  revs: string[],
  paths: string[]
): Promise<string[]> => {
  const files = clean(paths)
  if (!files.some((path) => /(^|\/)db\/[^/]+\/[^/]+$/.test(path))) return []
  const roots = await projectRoots(git, revs)
  return files.filter((path) =>
    roots.some((root) => isMigrationPath(root, path))
  )
}

/** The paths among `paths` that change a project's tables: its `db/tables.ts` or a migration. */
export const schemaFiles = async (
  git: GitOutput,
  revs: string[],
  paths: string[]
): Promise<string[]> => {
  const files = clean(paths)
  if (!files.some((path) => /(^|\/)db\//.test(path))) return []
  const roots = await projectRoots(git, revs)
  return files.filter((path) =>
    roots.some(
      (root) => isMigrationPath(root, path) || isTablesPath(root, path)
    )
  )
}

/** package.json files and the bun lockfile: a change to one needs an install. */
export const DEPENDENCY_FILES = /(^|\/)package\.json$|^bun\.lockb?$/

export const isDependencyFile = (path: string): boolean =>
  DEPENDENCY_FILES.test(path)
