import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.pikku',
  '.pikku-runtime',
  'coverage',
  '.next',
  '.yarn',
])

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

/**
 * `.gen.*` and `.d.ts` are the generator's own output — what they import is
 * decided by the codegen templates, not by the project. `application-types.d.ts`
 * falls under the same rule for a different reason: it is codegen's *input*, so
 * the bootstrap types it names have to come from core or the graph would cycle.
 */
export const isGenerated = (path: string) =>
  path.includes('.gen.') || path.endsWith('.d.ts')

/**
 * Every hand-written source file under `dir`.
 *
 * An app has no `src` convention to walk — bootstrap, wiring and test files sit
 * wherever the runtime wants them — so the whole tree is walked and what an app
 * accumulates is skipped instead: installed dependencies, build output, and its
 * own generated tree.
 */
export const collectAppSources = async (
  dir: string,
  out: string[] = []
): Promise<string[]> => {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      await collectAppSources(path, out)
    } else if (
      SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) &&
      !isGenerated(entry.name)
    ) {
      out.push(path)
    }
  }
  return out
}
