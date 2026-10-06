import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const MOCKS_DIR = '.mocks'

export const MOCK_STATES = ['healthy', 'empty', 'error', 'slow'] as const
export type MockState = (typeof MOCK_STATES)[number]

export interface MockMeta {
  label?: string
  description?: string
  state?: MockState
  default?: boolean
  delayMs?: number
  status?: number
}

export interface Mock {
  name: string
  hasData: boolean
  data?: unknown
  meta?: MockMeta
  problems: string[]
}

export interface RpcMocks {
  rpc: string
  mocks: Mock[]
}

const META_SUFFIX = '.meta.json'

const readJson = async (
  path: string
): Promise<{ value?: unknown; error?: string }> => {
  try {
    return { value: JSON.parse(await readFile(path, 'utf8')) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** Reports every way a `.meta.json` can be wrong, so one run shows them all. */
export const parseMeta = (
  raw: unknown
): { meta: MockMeta; problems: string[] } => {
  const problems: string[] = []
  const meta: MockMeta = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { meta, problems: ['meta is not an object'] }
  }
  const value = raw as Record<string, unknown>
  for (const key of ['label', 'description'] as const) {
    if (value[key] === undefined) continue
    if (typeof value[key] === 'string') meta[key] = value[key]
    else problems.push(`meta.${key} is not a string`)
  }
  if (value.state !== undefined) {
    if (MOCK_STATES.includes(value.state as MockState))
      meta.state = value.state as MockState
    else problems.push(`meta.state must be one of ${MOCK_STATES.join(', ')}`)
  }
  if (value.default !== undefined) {
    if (typeof value.default === 'boolean') meta.default = value.default
    else problems.push('meta.default is not a boolean')
  }
  for (const key of ['delayMs', 'status'] as const) {
    if (value[key] === undefined) continue
    if (typeof value[key] === 'number' && Number.isFinite(value[key]))
      meta[key] = value[key]
    else problems.push(`meta.${key} is not a number`)
  }
  return { meta, problems }
}

/** `bookings.list` on disk is the RPC `bookings:list`. */
export const rpcNameOf = (dir: string): string => dir.replaceAll('.', ':')

/** Reads `<root>/.mocks/<rpc.name>/<mock>.json` with its `<mock>.meta.json`. */
export const readMocks = async (rootDir: string): Promise<RpcMocks[]> => {
  const base = join(rootDir, MOCKS_DIR)
  if (!existsSync(base)) return []
  const dirs = (await readdir(base, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
  return Promise.all(
    dirs.map(async (dir) => {
      const files = await readdir(join(base, dir))
      const names = new Set(
        files
          .filter((f) => f.endsWith('.json'))
          .map((f) =>
            f.endsWith(META_SUFFIX)
              ? f.slice(0, -META_SUFFIX.length)
              : f.slice(0, -5)
          )
      )
      const mocks = await Promise.all(
        [...names].sort().map(async (name): Promise<Mock> => {
          const problems: string[] = []
          const mock: Mock = {
            name,
            hasData: files.includes(`${name}.json`),
            problems,
          }
          if (mock.hasData) {
            const read = await readJson(join(base, dir, `${name}.json`))
            if (read.error)
              problems.push(`${name}.json is not valid JSON: ${read.error}`)
            else mock.data = read.value
          } else {
            problems.push(`${name}.meta.json has no ${name}.json`)
          }
          if (files.includes(`${name}${META_SUFFIX}`)) {
            const read = await readJson(
              join(base, dir, `${name}${META_SUFFIX}`)
            )
            if (read.error) {
              problems.push(
                `${name}${META_SUFFIX} is not valid JSON: ${read.error}`
              )
            } else {
              const parsed = parseMeta(read.value)
              mock.meta = parsed.meta
              problems.push(
                ...parsed.problems.map((p) => `${name}${META_SUFFIX}: ${p}`)
              )
            }
          }
          return mock
        })
      )
      return { rpc: rpcNameOf(dir), mocks }
    })
  )
}
