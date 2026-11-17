import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isNestedProject,
  isSkippedDirectory,
} from '../../utils/pikku-directories.js'

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
  out: string[] = [],
  root = dir
): Promise<string[]> => {
  // A nested Pikku project (a workspace addon) is validated as its own project.
  if (isNestedProject(dir, root)) return out
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (isSkippedDirectory(entry.name)) continue
      await collectAppSources(path, out, root)
    } else if (
      SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) &&
      !isGenerated(entry.name)
    ) {
      out.push(path)
    }
  }
  return out
}
