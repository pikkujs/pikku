import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { glob } from 'tinyglobby'
import { ErrorCode } from '@pikku/inspector'

// Bounded globs (no unbounded `**`) covering the real @pikku/core copies each
// package manager keeps: hoisted root, bun (.bun), pnpm (.pnpm), and one level
// of npm/yarn nesting (both plain and scoped dependents).
const PATTERNS = [
  '@pikku/core/package.json',
  '.bun/@pikku+core@*/node_modules/@pikku/core/package.json',
  '.pnpm/@pikku+core@*/node_modules/@pikku/core/package.json',
  '*/node_modules/@pikku/core/package.json',
  '@*/*/node_modules/@pikku/core/package.json',
]

/**
 * Fail the build when more than one @pikku/core version is installed.
 *
 * A split @pikku/core means two separate module instances — and therefore two
 * separate pikkuState registries — at runtime. Wirings (workflows, RPCs, queue
 * workers, middleware) register into whichever copy the wiring files import,
 * while the runner may read the other, so they silently fail to resolve (the
 * classic symptom being `WorkflowNotFoundError` for a workflow that is plainly
 * registered). Distinct versions are the reliable signal: package managers dedupe
 * identical versions to one physical copy, so >1 version guarantees a split.
 */
export async function assertSingleCoreVersion(
  rootDir: string,
  logger: { warn: (message: string) => void }
): Promise<void> {
  const nodeModules = path.join(path.resolve(rootDir), 'node_modules')
  const found = await glob(PATTERNS, {
    cwd: nodeModules,
    absolute: true,
    onlyFiles: true,
  }).catch(() => [] as string[])

  // Dedupe by real path (symlinks/hoisting surface the same copy many times),
  // then map each physical copy to its version.
  const byRealPath = new Map<string, string>()
  for (const pkgJsonPath of found) {
    let real: string
    try {
      real = realpathSync(pkgJsonPath)
    } catch {
      real = pkgJsonPath
    }
    if (byRealPath.has(real)) continue
    const raw = await readFile(pkgJsonPath, 'utf-8').catch(() => '')
    if (!raw) continue
    try {
      const { version } = JSON.parse(raw)
      if (typeof version === 'string') byRealPath.set(real, version)
    } catch {
      // Unparseable package.json can't contribute a version — skip it.
    }
  }

  const versions = new Set(byRealPath.values())
  if (versions.size <= 1) return

  const found_ = [...byRealPath.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([p, v]) => `  ${v}  ${path.dirname(p)}`)
    .join('\n')

  const message =
    `[${ErrorCode.DUPLICATE_CORE_VERSION}] Multiple @pikku/core versions installed: ${[...versions].sort().join(', ')}.\n` +
    `A split @pikku/core means two separate pikkuState registries at runtime — wirings\n` +
    `(workflows, RPCs, queue workers, middleware) register into one copy while the runner\n` +
    `reads another, so they silently fail to resolve (e.g. WorkflowNotFoundError, missing\n` +
    `RPCs). Every @pikku/* package must resolve to a single @pikku/core.\n\n` +
    `Found:\n${found_}\n\n` +
    `Fix: align all @pikku/* dependencies to the same release (bump them together), or pin\n` +
    `@pikku/core via your package manager's overrides/resolutions, then reinstall so a\n` +
    `single copy is deduped. Set PIKKU_ALLOW_DUPLICATE_CORE=1 to downgrade this to a warning.`

  if (process.env?.PIKKU_ALLOW_DUPLICATE_CORE) {
    logger.warn(message)
    return
  }
  throw new Error(message)
}
