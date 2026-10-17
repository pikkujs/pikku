import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { FileHashes } from './native-comparison-report.js'

const GENERATED_FILE = /\.gen\.[^/\\]+$/
const SKIPPED_DIRS = new Set(['node_modules', '.git'])

export type GeneratedPaths = {
  /** Every `.pikku` directory in the project, plus the configured outDir. */
  pikkuDirs: string[]
  /** `*.gen.*` files outside those directories. */
  genFiles: string[]
}

const isInside = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(dir + sep)

/**
 * Walks the project for what `pikku all` writes: `.pikku` directories and
 * `*.gen.*` files. Dependencies, VCS metadata and other dot-directories are
 * not descended into.
 */
export const findGeneratedPaths = (
  rootDir: string,
  outDir: string
): GeneratedPaths => {
  const pikkuDirs: string[] = []
  const genFiles: string[] = []
  const walk = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '.pikku' || path === outDir) {
          pikkuDirs.push(path)
        } else if (
          !SKIPPED_DIRS.has(entry.name) &&
          !entry.name.startsWith('.')
        ) {
          walk(path)
        }
      } else if (entry.isFile() && GENERATED_FILE.test(entry.name)) {
        genFiles.push(path)
      }
    }
  }
  walk(rootDir)
  if (!pikkuDirs.some((d) => isInside(outDir, d))) pikkuDirs.push(outDir)
  return {
    pikkuDirs: pikkuDirs.sort(),
    genFiles: genFiles
      .filter((f) => !pikkuDirs.some((d) => isInside(f, d)))
      .sort(),
  }
}

const listFiles = (dir: string): string[] => {
  const files: string[] = []
  const walk = (current: string): void => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  walk(dir)
  return files
}

const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * Hashes the generated output an engine is responsible for: every file under
 * the outDir and every `*.gen.*` file elsewhere in the project, keyed by path
 * relative to the project root.
 */
export const hashGeneratedOutput = (
  rootDir: string,
  outDir: string
): FileHashes => {
  const { genFiles } = findGeneratedPaths(rootDir, outDir)
  const hashes: FileHashes = {}
  for (const file of [...listFiles(outDir), ...genFiles]) {
    hashes[relative(rootDir, file).split(sep).join('/')] = sha256(file)
  }
  return hashes
}

type SavedFile = { path: string; backup: string; atime: Date; mtime: Date }

/**
 * A copy of the project's generated state, taken before the first run and put
 * back before every run and at the end. Restoring is synchronous so it can run
 * from a signal handler.
 *
 * Deleting `.pikku` is not an option: it also holds files `pikku all` does not
 * regenerate, like the db schema `pikku db migrate` writes.
 */
export class GeneratedSnapshot {
  private constructor(
    private readonly rootDir: string,
    private readonly outDir: string,
    private readonly backupDir: string,
    private readonly dirs: { path: string; backup: string | undefined }[],
    private readonly files: SavedFile[]
  ) {}

  static take(rootDir: string, outDir: string): GeneratedSnapshot {
    const backupDir = mkdtempSync(join(tmpdir(), 'pikku-native-comparison-'))
    const { pikkuDirs, genFiles } = findGeneratedPaths(rootDir, outDir)
    const dirs = pikkuDirs.map((path, i) => {
      if (!existsSync(path)) return { path, backup: undefined }
      const backup = join(backupDir, 'dirs', String(i))
      cpSync(path, backup, {
        recursive: true,
        preserveTimestamps: true,
        verbatimSymlinks: true,
      })
      return { path, backup }
    })
    mkdirSync(join(backupDir, 'files'), { recursive: true })
    const files = genFiles.map((path, i) => {
      const backup = join(backupDir, 'files', String(i))
      copyFileSync(path, backup)
      const { atime, mtime } = statSync(path)
      return { path, backup, atime, mtime }
    })
    return new GeneratedSnapshot(rootDir, outDir, backupDir, dirs, files)
  }

  restore(): void {
    const known = new Set(this.dirs.map((d) => d.path))
    const current = findGeneratedPaths(this.rootDir, this.outDir)
    for (const dir of current.pikkuDirs) {
      if (!known.has(dir)) rmSync(dir, { recursive: true, force: true })
    }
    for (const { path, backup } of this.dirs) {
      rmSync(path, { recursive: true, force: true })
      if (backup) {
        cpSync(backup, path, {
          recursive: true,
          preserveTimestamps: true,
          verbatimSymlinks: true,
        })
      }
    }
    const knownFiles = new Set(this.files.map((f) => f.path))
    for (const file of current.genFiles) {
      if (!knownFiles.has(file)) unlinkSync(file)
    }
    for (const { path, backup, atime, mtime } of this.files) {
      copyFileSync(backup, path)
      utimesSync(path, atime, mtime)
    }
  }

  dispose(): void {
    rmSync(this.backupDir, { recursive: true, force: true })
  }
}
