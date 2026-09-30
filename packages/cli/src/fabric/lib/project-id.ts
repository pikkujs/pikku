import { existsSync } from 'node:fs'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { git } from '../../utils/git.js'

const CONFIG = 'pikku.config.json'

export const findPikkuConfigPath = (
  startDir = process.cwd()
): string | null => {
  let dir = startDir
  while (true) {
    const candidate = join(dir, CONFIG)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const idFrom = (raw: string): string | null => {
  try {
    const { projectId } = JSON.parse(raw)
    return typeof projectId === 'string' && projectId.trim()
      ? projectId.trim()
      : null
  } catch {
    return null
  }
}

export const readConfigProjectId = async (
  startDir?: string
): Promise<{ projectId: string; path: string } | null> => {
  const path = findPikkuConfigPath(startDir)
  if (!path) return null
  const projectId = idFrom(await readFile(path, 'utf8'))
  return projectId ? { projectId, path } : null
}

/**
 * Sets `projectId` in pikku.config.json by editing the text, so the rest of
 * the file keeps its formatting and the diff is one line. Nothing is staged or
 * committed. Returns false when there is no config to write to.
 */
export const writeConfigProjectId = async (
  projectId: string,
  startDir?: string
): Promise<boolean> => {
  const path = findPikkuConfigPath(startDir)
  if (!path) return false
  const raw = await readFile(path, 'utf8')
  const value = JSON.stringify(projectId)
  const existing = raw.match(/("projectId"\s*:\s*)"(?:[^"\\]|\\.)*"/)
  if (existing) {
    await writeFile(path, raw.replace(existing[0], `${existing[1]}${value}`))
    return true
  }
  const open = raw.indexOf('{')
  if (open === -1) return false
  const indent = raw.slice(open + 1).match(/^\s*\n([ \t]+)\S/)?.[1] ?? '  '
  const hasKeys = /^\s*"/.test(raw.slice(open + 1))
  const inserted = `\n${indent}"projectId": ${value}` + (hasKeys ? ',' : '')
  await writeFile(
    path,
    raw.slice(0, open + 1) +
      inserted +
      (hasKeys ? '' : '\n') +
      raw.slice(open + 1)
  )
  return true
}

const withoutProjectId = (raw: string): unknown => {
  try {
    const { projectId: _ignored, ...rest } = JSON.parse(raw)
    return rest
  } catch {
    return raw
  }
}

/**
 * `git status` is clean, allowing one exception: pikku.config.json differing
 * from HEAD only in its `projectId`. The CLI writes that key uncommitted, and
 * it must not block a deploy — fabric never reads it from the clone.
 */
export const isTreeCleanBesidesProjectId = async (
  cwd?: string
): Promise<boolean> => {
  const out = await git(['status', '--porcelain'], cwd)
  if (!out) return true
  const configPath = findPikkuConfigPath(cwd)
  if (!configPath) return false
  const root = await git(['rev-parse', '--show-toplevel'], cwd)
  const rel = relative(await realpath(root), await realpath(configPath))
  const lines = out.split('\n')
  if (lines.some((line) => line.trim() !== `M ${rel}`)) return false
  const [head, now] = await Promise.all([
    git(['show', `HEAD:${rel}`], root).catch(() => null),
    readFile(configPath, 'utf8').catch(() => null),
  ])
  if (head === null || now === null) return false
  return (
    JSON.stringify(withoutProjectId(head)) ===
    JSON.stringify(withoutProjectId(now))
  )
}
