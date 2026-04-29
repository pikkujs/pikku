import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, isAbsolute, relative, resolve } from 'node:path'

/**
 * StateDiffService computes a structural diff between two `.pikku/`
 * directories — typically "ours" (the user's current branch) and "base"
 * (a baseline checkout, often a worktree at `main`).
 *
 * Both directories are expected to contain the meta JSON files emitted by
 * `pikku all`. Files that are missing on either side are treated as empty
 * objects, so the diff degrades gracefully.
 */

const META_FILES = {
  functions: 'function/pikku-functions-meta.gen.json',
  middleware: 'middleware/pikku-middleware-groups-meta.gen.json',
  http: 'http/pikku-http-wirings-meta.gen.json',
  scheduler: 'scheduler/pikku-schedulers-wirings-meta.gen.json',
  queue: 'queue/pikku-queue-workers-wirings-meta.gen.json',
  channel: 'channel/pikku-channels-meta.gen.json',
  trigger: 'trigger/pikku-trigger-meta.gen.json',
  mcp: 'mcp/pikku-mcp-wirings-meta.gen.json',
  agent: 'agent/pikku-agent-wirings-meta.gen.json',
  cli: 'cli/pikku-cli-wirings-meta.gen.json',
  variables: 'variables/pikku-variables-meta.gen.json',
  secrets: 'secrets/pikku-secrets-meta.gen.json',
} as const

export type StateDiffCategory = keyof typeof META_FILES

export interface DiffEntry<T = Record<string, unknown>> {
  id: string
  status: 'added' | 'removed' | 'modified' | 'unchanged'
  ours?: T
  base?: T
}

export interface CategoryDiff {
  added: number
  removed: number
  modified: number
  unchanged: number
  entries: DiffEntry[]
}

export interface StateDiff {
  oursPath: string
  basePath: string
  oursExists: boolean
  baseExists: boolean
  categories: Record<StateDiffCategory, CategoryDiff>
  summary: Record<
    StateDiffCategory,
    { added: number; removed: number; modified: number }
  >
}

export class StateDiffService {
  constructor(private readonly rootDir: string) {}

  async diff(input: {
    oursPath?: string
    basePath: string
  }): Promise<StateDiff> {
    const oursPath = this.resolvePath(input.oursPath ?? '.pikku')
    const basePath = this.resolvePath(input.basePath)

    const oursExists = existsSync(oursPath)
    const baseExists = existsSync(basePath)

    const categories = {} as Record<StateDiffCategory, CategoryDiff>
    const summary = {} as Record<
      StateDiffCategory,
      { added: number; removed: number; modified: number }
    >

    for (const [name, relPath] of Object.entries(META_FILES) as Array<
      [StateDiffCategory, string]
    >) {
      const ours = await this.readMeta(join(oursPath, relPath))
      const base = await this.readMeta(join(basePath, relPath))
      const cat = this.diffCategory(name, ours, base)
      categories[name] = cat
      summary[name] = {
        added: cat.added,
        removed: cat.removed,
        modified: cat.modified,
      }
    }

    return { oursPath, basePath, oursExists, baseExists, categories, summary }
  }

  /**
   * Resolve a caller-supplied path against the project root. Refuses
   * absolute paths and any `..`-traversal that escapes `rootDir` — the
   * console addon may be reachable from a browser, so we don't want a
   * compromised page reading arbitrary files via this RPC.
   */
  private resolvePath(p: string): string {
    if (isAbsolute(p)) {
      throw new Error(
        `StateDiffService: absolute paths are not permitted (got ${JSON.stringify(p)})`
      )
    }
    const target = resolve(this.rootDir, p)
    const rel = relative(this.rootDir, target)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(
        `StateDiffService: path escapes rootDir (got ${JSON.stringify(p)})`
      )
    }
    return target
  }

  private async readMeta(path: string): Promise<Record<string, unknown>> {
    if (!existsSync(path)) return {}
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return {}
      return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }

  /**
   * For nested-key categories like HTTP wirings ({ [method]: { [route]: meta } }),
   * we flatten to a single keyspace `<method>:<route>` so the diff is uniform.
   * Other categories are already flat ({ [id]: meta }).
   */
  private flatten(
    category: StateDiffCategory,
    raw: Record<string, unknown>
  ): Record<string, unknown> {
    if (category !== 'http') return raw
    const flat: Record<string, unknown> = {}
    for (const [method, routes] of Object.entries(raw)) {
      if (routes && typeof routes === 'object' && !Array.isArray(routes)) {
        for (const [route, meta] of Object.entries(
          routes as Record<string, unknown>
        )) {
          flat[`${method}:${route}`] = meta
        }
      }
    }
    return flat
  }

  private diffCategory(
    category: StateDiffCategory,
    oursRaw: Record<string, unknown>,
    baseRaw: Record<string, unknown>
  ): CategoryDiff {
    const ours = this.flatten(category, oursRaw)
    const base = this.flatten(category, baseRaw)

    const allIds = new Set([...Object.keys(ours), ...Object.keys(base)])
    const entries: DiffEntry[] = []
    let added = 0
    let removed = 0
    let modified = 0
    let unchanged = 0

    for (const id of allIds) {
      const o = ours[id] as Record<string, unknown> | undefined
      const b = base[id] as Record<string, unknown> | undefined

      if (o && !b) {
        entries.push({ id, status: 'added', ours: o })
        added++
      } else if (!o && b) {
        entries.push({ id, status: 'removed', base: b })
        removed++
      } else if (o && b) {
        if (this.shallowEqual(o, b)) {
          entries.push({ id, status: 'unchanged', ours: o, base: b })
          unchanged++
        } else {
          entries.push({ id, status: 'modified', ours: o, base: b })
          modified++
        }
      }
    }

    entries.sort((a, b) => {
      const order = { added: 0, modified: 1, removed: 2, unchanged: 3 }
      return order[a.status] - order[b.status] || a.id.localeCompare(b.id)
    })

    return { added, removed, modified, unchanged, entries }
  }

  /**
   * Fields that vary by absolute path or by environment but don't represent
   * a meaningful structural change. Excluded from equality so the same
   * function in two different working directories isn't flagged as modified.
   */
  private static readonly NORMALIZE_IGNORE = new Set(['sourceFile'])

  private normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.normalize(v))
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      const keys = Object.keys(value as Record<string, unknown>).sort()
      for (const k of keys) {
        if (StateDiffService.NORMALIZE_IGNORE.has(k)) continue
        out[k] = this.normalize((value as Record<string, unknown>)[k])
      }
      return out
    }
    return value
  }

  private shallowEqual(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): boolean {
    return (
      JSON.stringify(this.normalize(a)) === JSON.stringify(this.normalize(b))
    )
  }
}
