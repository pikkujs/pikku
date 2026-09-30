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
    const projectId = JSON.parse(raw)?.fabric?.projectId
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

const closingBrace = (raw: string, open: number): number => {
  let depth = 0
  for (let i = open; i < raw.length; i++) {
    const c = raw[i]
    if (c === '"') {
      i++
      while (i < raw.length && raw[i] !== '"') i += raw[i] === '\\' ? 2 : 1
    } else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

const indentAfter = (raw: string, open: number): string =>
  raw.slice(open + 1).match(/^[ \t]*\r?\n([ \t]+)\S/)?.[1] ?? '  '

const insertKey = (
  raw: string,
  open: number,
  text: (indent: string, hasKeys: boolean) => string
): string => {
  const close = closingBrace(raw, open)
  const hasKeys = close !== -1 && /\S/.test(raw.slice(open + 1, close))
  const indent = indentAfter(raw, open)
  return (
    raw.slice(0, open + 1) +
    `\n${indent}${text(indent, hasKeys)}` +
    (hasKeys ? '' : '\n') +
    raw.slice(open + 1)
  )
}

/**
 * Sets `fabric.projectId` in pikku.config.json by editing the text, so the
 * rest of the file keeps its formatting and the diff stays small. Nothing is
 * staged or committed. Returns false when there is no config to write to.
 */
export const writeConfigProjectId = async (
  projectId: string,
  startDir?: string
): Promise<boolean> => {
  const path = findPikkuConfigPath(startDir)
  if (!path) return false
  const raw = await readFile(path, 'utf8')
  const value = JSON.stringify(projectId)
  const rootOpen = raw.indexOf('{')
  if (rootOpen === -1) return false

  const block = raw.match(/"fabric"\s*:\s*\{/)
  if (block) {
    const open = block.index! + block[0].length - 1
    const close = closingBrace(raw, open)
    const inner = raw.slice(open, close + 1)
    const existing = inner.match(/("projectId"\s*:\s*)"(?:[^"\\]|\\.)*"/)
    const next = existing
      ? inner.replace(existing[0], `${existing[1]}${value}`)
      : insertKey(
          inner,
          0,
          (_i, hasKeys) => `"projectId": ${value}${hasKeys ? ',' : ''}`
        )
    await writeFile(path, raw.slice(0, open) + next + raw.slice(close + 1))
    return true
  }

  await writeFile(
    path,
    insertKey(
      raw,
      rootOpen,
      (indent, hasKeys) =>
        `"fabric": { "projectId": ${value} }${hasKeys ? ',' : ''}`
    )
  )
  return true
}

const withoutProjectId = (raw: string): unknown => {
  try {
    const { fabric, ...rest } = JSON.parse(raw)
    if (!fabric || typeof fabric !== 'object') return { ...rest, fabric }
    const { projectId: _ignored, ...others } = fabric
    return Object.keys(others).length ? { ...rest, fabric: others } : rest
  } catch {
    return raw
  }
}

/**
 * `git status` is clean, allowing one exception: pikku.config.json differing
 * from HEAD only in `fabric.projectId`. The CLI writes that key uncommitted, and
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
