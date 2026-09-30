/**
 * Loadable SQLite extensions a compiled bun binary carries inside itself.
 *
 * `bun build --compile` embeds a file imported `with { type: 'file' }` and
 * hands back a `/$bunfs/…` path, which bun's own file APIs can read but
 * SQLite's `dlopen` cannot. So the bytes are written out to a real file first,
 * and that is the path SQLite loads.
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export interface EmbeddedFile {
  /**
   * The file's original name. Kept because SQLite derives an extension's entry
   * point from it (`vec0.dylib` → `sqlite3_vec_init`), and bun renames what it
   * embeds.
   */
  name: string
  /** Where bun serves the embedded copy from. */
  path: string
}

/**
 * Write each embedded file under `dir` and return the paths to load, in order.
 *
 * Files go in a directory named for their content, so a new release writes
 * beside the old one rather than over a library another process — the previous
 * release, still draining — may have mapped. An existing copy is trusted as is:
 * the name is its hash, so only something with write access to `dir` could have
 * made it differ, and `dir` is the operator's data directory, which that
 * something could corrupt more directly anyway.
 *
 * Each write goes to a temporary name and is renamed into place, so a process
 * killed mid-write, or two starting at once, cannot leave a truncated library
 * for the next start to load.
 */
export function materializeEmbeddedFiles(
  embedded: EmbeddedFile[],
  dir: string
): string[] {
  return embedded.map(({ name, path }) => {
    const bytes = readFileSync(path)
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
    const target = join(dir, hash, name)
    if (!existsSync(target)) {
      mkdirSync(join(dir, hash), { recursive: true })
      const partial = `${target}.${process.pid}.partial`
      writeFileSync(partial, bytes, { mode: 0o755 })
      renameSync(partial, target)
    }
    return target
  })
}
