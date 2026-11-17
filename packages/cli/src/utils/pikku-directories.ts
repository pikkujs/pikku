import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * Directories a project accumulates that are never its own source: installed
 * dependencies, build output, and the generated tree. Every other directory
 * starting with a dot is skipped as well (see `isSkippedDirectory`).
 */
export const SKIP_DIRS = new Set([
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

export const CONFIG_FILE = 'pikku.config.json'

export const isSkippedDirectory = (name: string): boolean =>
  SKIP_DIRS.has(name) || name.startsWith('.')

/**
 * A directory below a project root that holds its own pikku.config.json is a
 * project of its own (an addon or a functions package): the project above does
 * not inspect it, it is inspected where it lives.
 */
export const isNestedProject = (dir: string, root: string): boolean =>
  dir !== root && existsSync(join(dir, CONFIG_FILE))

/**
 * The directories of a project that code is read from, as written in a raw
 * pikku.config.json: the project's own directory first, then each package it
 * lists in `pikkuDirectories`. Entries are relative to the config's `rootDir`.
 */
export const projectSourceDirs = (config: {
  pikkuDirectories?: unknown
}): string[] => [
  '.',
  ...(Array.isArray(config.pikkuDirectories)
    ? config.pikkuDirectories.filter((d): d is string => typeof d === 'string')
    : []),
]

/**
 * Every file under `dirs` (relative to `root`) whose name ends in one of
 * `extensions`, walking the way the inspector does: build output, dependencies,
 * dot-directories and any nested project are left alone, except where a nested
 * project is itself the directory being walked.
 */
export const listProjectFiles = async (
  root: string,
  dirs: string[],
  extensions: string[]
): Promise<string[]> => {
  const found = new Set<string>()
  const walk = async (dir: string, start: string): Promise<void> => {
    if (isNestedProject(dir, start)) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!isSkippedDirectory(entry.name)) await walk(path, start)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        found.add(path)
      }
    }
  }
  for (const dir of dirs) {
    const start = resolve(root, dir)
    await walk(start, start)
  }
  return [...found].sort()
}
