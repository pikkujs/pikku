import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Structural diff of the generated `.pikku` meta between two points in time —
 * used by `pikku all --diff` to report what a codegen run added/removed/changed
 * (functions, wirings, workflows, emails, …). The snapshot is a plain in-memory
 * copy of the meta files, so diffing is a couple of small JSON reads, not a
 * second inspection pass. Only user-visible buildable surfaces are included;
 * plumbing (secrets/variables/middleware/permissions) is intentionally omitted.
 */

export type MetaDiffCategoryName =
  | 'functions'
  | 'http'
  | 'workflow'
  | 'email'
  | 'scheduler'
  | 'queue'
  | 'channel'
  | 'trigger'
  | 'mcp'
  | 'agent'

// Single-file categories: one JSON file whose top-level keys are the ids
// (http is nested `{ method: { route: meta } }` and flattened to `method route`).
const SINGLE_FILE: Record<Exclude<MetaDiffCategoryName, 'workflow'>, string> = {
  functions: 'function/pikku-functions-meta.gen.json',
  http: 'http/pikku-http-wirings-meta.gen.json',
  email: 'email/pikku-emails-meta.gen.json',
  scheduler: 'scheduler/pikku-schedulers-wirings-meta.gen.json',
  queue: 'queue/pikku-queue-workers-wirings-meta.gen.json',
  channel: 'channel/pikku-channels-meta.gen.json',
  trigger: 'trigger/pikku-trigger-meta.gen.json',
  mcp: 'mcp/pikku-mcp-wirings-meta.gen.json',
  agent: 'agent/pikku-agent-wirings-meta.gen.json',
}

// A few meta files wrap their real entities under a single key rather than
// keying them at the top level — unwrap to that map so ids are the entities.
const UNWRAP: Partial<Record<MetaDiffCategoryName, string>> = {
  email: 'templates',
  agent: 'agentsMeta',
}

// Workflows (incl. userflows/scenarios) are written one file per workflow under
// this dir; the file basename (sans `.gen.json`) is the id, `-verbose` excluded.
const WORKFLOW_META_DIR = 'workflow/meta'

export interface MetaDiffEntry {
  id: string
  status: 'added' | 'removed' | 'modified'
}

export interface MetaDiffCategory {
  added: number
  removed: number
  modified: number
  entries: MetaDiffEntry[]
}

export interface MetaDiff {
  totals: { added: number; removed: number; modified: number }
  // Only categories with at least one change are present — so a consumer can
  // render a single card for one category or a tabbed card for several.
  categories: Partial<Record<MetaDiffCategoryName, MetaDiffCategory>>
}

// Snapshot = category → { id → normalized entry } captured at one instant.
export type MetaSnapshot = Partial<Record<MetaDiffCategoryName, Record<string, unknown>>>

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function readSingle(outDir: string, category: MetaDiffCategoryName, relPath: string): Record<string, unknown> {
  let raw = readJson(join(outDir, relPath))
  const unwrapKey = UNWRAP[category]
  if (unwrapKey) {
    const inner = raw[unwrapKey]
    raw = inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : {}
  }
  if (category !== 'http') return raw
  const flat: Record<string, unknown> = {}
  for (const [method, routes] of Object.entries(raw)) {
    if (routes && typeof routes === 'object' && !Array.isArray(routes)) {
      for (const [route, meta] of Object.entries(routes as Record<string, unknown>)) {
        flat[`${method.toUpperCase()} ${route}`] = meta
      }
    }
  }
  return flat
}

function readWorkflows(outDir: string): Record<string, unknown> {
  const dir = join(outDir, WORKFLOW_META_DIR)
  if (!existsSync(dir)) return {}
  const out: Record<string, unknown> = {}
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.gen.json') || file.endsWith('-verbose.gen.json')) continue
    out[file.slice(0, -'.gen.json'.length)] = readJson(join(dir, file))
  }
  return out
}

/** Read the current meta from disk into an in-memory snapshot. */
export function readMetaSnapshot(outDir: string): MetaSnapshot {
  if (!outDir || !existsSync(outDir)) return {}
  const snap: MetaSnapshot = {}
  for (const [category, relPath] of Object.entries(SINGLE_FILE) as Array<
    [Exclude<MetaDiffCategoryName, 'workflow'>, string]
  >) {
    snap[category] = readSingle(outDir, category, relPath)
  }
  snap.workflow = readWorkflows(outDir)
  return snap
}

// Volatile fields that vary by absolute path / environment but aren't a
// meaningful structural change — excluded from equality (matches StateDiffService).
const NORMALIZE_IGNORE = new Set(['sourceFile'])

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (NORMALIZE_IGNORE.has(key)) continue
      out[key] = normalize((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

/** Diff two snapshots; only changed ids and non-empty categories are returned. */
export function computeMetaDiff(before: MetaSnapshot, after: MetaSnapshot): MetaDiff {
  const categories: MetaDiff['categories'] = {}
  const totals = { added: 0, removed: 0, modified: 0 }

  const names = new Set<MetaDiffCategoryName>([
    ...(Object.keys(before) as MetaDiffCategoryName[]),
    ...(Object.keys(after) as MetaDiffCategoryName[]),
  ])

  for (const name of names) {
    const o = before[name] ?? {}
    const a = after[name] ?? {}
    const ids = new Set([...Object.keys(o), ...Object.keys(a)])
    const entries: MetaDiffEntry[] = []
    let added = 0
    let removed = 0
    let modified = 0
    for (const id of ids) {
      const inO = id in o
      const inA = id in a
      if (inA && !inO) {
        entries.push({ id, status: 'added' })
        added++
      } else if (inO && !inA) {
        entries.push({ id, status: 'removed' })
        removed++
      } else if (!equal(o[id], a[id])) {
        entries.push({ id, status: 'modified' })
        modified++
      }
    }
    if (entries.length === 0) continue
    entries.sort((x, y) => {
      const order = { added: 0, modified: 1, removed: 2 }
      return order[x.status] - order[y.status] || x.id.localeCompare(y.id)
    })
    categories[name] = { added, removed, modified, entries }
    totals.added += added
    totals.removed += removed
    totals.modified += modified
  }

  return { totals, categories }
}
