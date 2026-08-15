import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type PackageManager = 'bun' | 'yarn' | 'pnpm' | 'npm'

/** `<pm> <args...> <pkg>` for adding a dependency. */
export const installArgs: Record<PackageManager, (pkg: string) => string[]> = {
  bun: (pkg) => ['add', pkg],
  yarn: (pkg) => ['add', pkg],
  pnpm: (pkg) => ['add', pkg],
  npm: (pkg) => ['install', pkg],
}

/**
 * How each package manager runs a locally-installed binary. `npx` only exists
 * where npm does — a bun-only image (no node, no npm) has `bunx` and nothing
 * else, so the runner has to follow the detected manager.
 */
export const execPrefix: Record<PackageManager, [string, ...string[]]> = {
  bun: ['bunx'],
  yarn: ['yarn'],
  pnpm: ['pnpm', 'exec'],
  npm: ['npx'],
}

// bun.lock (bun >= 1.2, text) and bun.lockb (binary) are both valid.
const LOCKFILES: Array<[string, PackageManager]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['yarn.lock', 'yarn'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
]

/** The corepack field of `dir/package.json`, when it names a manager we run. */
function declaredPackageManager(dir: string): PackageManager | null {
  const pkgJsonPath = join(dir, 'package.json')
  if (!existsSync(pkgJsonPath)) return null
  try {
    const declared = JSON.parse(
      readFileSync(pkgJsonPath, 'utf-8')
    ).packageManager
    // e.g. "bun@1.3.14", "yarn@4.5.0+sha224.abc"
    const name = typeof declared === 'string' ? declared.split('@')[0] : null
    if (name && name in installArgs) return name as PackageManager
  } catch (e) {
    // A malformed package.json is the project's problem, not ours — fall
    // through to lockfile detection rather than failing the install.
    console.warn(`Could not read packageManager from ${pkgJsonPath}:`, e)
  }
  return null
}

/**
 * Which package manager runs in this project. `packageManager` in package.json
 * (the corepack field) is authoritative — it states intent even before a
 * lockfile exists, and a project can carry a stale lockfile from another tool.
 * Lockfiles are the fallback, then npm, which every Node install ships with.
 *
 * The search walks up from `rootDir`, because `rootDir` is the pikku root (the
 * directory holding pikku.config.json) and in a monorepo that is a package dir
 * carrying neither signal — both live at the workspace root above it. Stopping
 * at the pikku root would fall through to the npm default and run `npm install`
 * inside a yarn workspace, which dies on `Unsupported URL Type "workspace:"`.
 *
 * A declared manager anywhere up the tree outranks any lockfile, for the same
 * reason it does within one directory: lockfiles get copied around and go
 * stale, so a stray package-lock.json in a sub-package must not override the
 * workspace root's declared yarn.
 *
 * Guessing wrong is not a soft failure: the install spawns a binary that isn't
 * on PATH and the caller sees `Executable not found in $PATH: "yarn"`.
 */
export function resolvePackageManager(rootDir: string): PackageManager {
  let nearestLockfile: PackageManager | null = null

  let dir = rootDir
  while (true) {
    const declared = declaredPackageManager(dir)
    if (declared) return declared

    if (!nearestLockfile) {
      for (const [lock, pm] of LOCKFILES) {
        if (existsSync(join(dir, lock))) {
          nearestLockfile = pm
          break
        }
      }
    }

    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return nearestLockfile ?? 'npm'
}
