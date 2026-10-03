import type { MetaService } from '../../services/meta-service.js'

/** Per-function line coverage as `pikku scenario run --coverage` records it. */
export interface ScenarioFunctionCoverage {
  name: string
  sourceFile: string
  status: 'covered' | 'partial' | 'uncovered' | 'unknown'
  totalLines: number
  missedLines: number[]
}

/** The file `pikku scenario run --coverage` writes to `.pikku/coverage/scenario-coverage.json`. */
export interface ScenarioCoverageFile {
  generatedAt: string
  environment: string
  scenarios: Record<
    string,
    { functions?: ScenarioFunctionCoverage[]; summary?: { total?: number } }
  >
}

/** A function with lines no scenario reaches. */
export interface ScenarioCoverageGap {
  function: string
  sourceFile: string
  status: 'uncovered' | 'partial'
  /** Collapsed line ranges, e.g. `["L14-31", "L42"]`. */
  missing: string[]
  missedLines: number
  totalLines: number
}

/** A mutation a user can perform that no scenario drives. */
export interface UncoveredMutation {
  id: string
  sourceFile?: string
}

export interface ScenarioCoverage {
  /** Line coverage across every scenario; `null` until a run with `--coverage` has been recorded. */
  api: {
    generatedAt: string
    environment: string
    pct: number
    covered: number
    total: number
    gaps: ScenarioCoverageGap[]
  } | null
  mutations: {
    required: number
    covered: number
    uncovered: UncoveredMutation[]
  }
  /** Paths a scenario opens; `unvisited` only when the caller knows the app's routes, which may carry `$param` segments. */
  routes: {
    visited: string[]
    total: number | null
    unvisited: string[] | null
  }
}

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

const MUTATING_VERB =
  /^(create|add|new|update|edit|set|change|rename|delete|remove|destroy|archive|restore|assign|unassign|submit|approve|reject|cancel|complete|start|stop|send|invite|upload|register|book|reserve|claim|join|leave|mark|toggle|move|reorder|import|apply|save|record|log|generate|grant|revoke|link|unlink|publish|unpublish|enable|disable|accept|decline|resend|retry|sync|trigger|run|provision|deploy|purchase|checkout|pay|refund|subscribe|unsubscribe|reset|confirm|rotate|attach|detach|duplicate|clone|merge|split|schedule|reschedule|dispatch|finish|close|reopen|promote|demote|transfer|swap|seed|clear|cleanup|refresh|rebuild|install|uninstall|connect|disconnect|activate|deactivate|block|unblock|pin|unpin|vote|rate|comment|reply|post)([A-Z0-9]|$)/

const NAVIGATION_STEPS = new Set(['opensPage'])

const isFrameworkTagged = (tags?: string[]) =>
  (tags ?? []).some((tag) => tag === 'pikku' || tag.startsWith('pikku:'))

const isGenerated = (sourceFile?: string) => /\.gen\.ts$/.test(sourceFile ?? '')

const normalisePath = (path: string) =>
  path.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/'

/** Whether a concrete path is served by a route pattern: `$name` matches one segment, a bare `$` the rest, `{-$name}` one or none. */
export function routeMatchesPath(route: string, path: string): boolean {
  const pattern = normalisePath(route).split('/').filter(Boolean)
  const segments = normalisePath(path).split('/').filter(Boolean)
  const match = (i: number, j: number): boolean => {
    if (i === pattern.length) return j === segments.length
    const part = pattern[i]!
    if (part === '$' || part === '*') return true
    if (/^\{-\$.+\}$/.test(part))
      return match(i + 1, j) || (j < segments.length && match(i + 1, j + 1))
    if (j === segments.length) return false
    if (part.startsWith('$') || part === segments[j]) return match(i + 1, j + 1)
    return false
  }
  return match(0, 0)
}

const pct = (covered: number, total: number) =>
  total === 0 ? 100 : Math.round((covered / total) * 100)

function collapseRanges(lines: number[]): string[] {
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const ranges: string[] = []
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    ranges.push(
      sorted[i] === sorted[j] ? `L${sorted[i]}` : `L${sorted[i]}-${sorted[j]}`
    )
    i = j + 1
  }
  return ranges
}

/** Lines no scenario reaches, per function: a line counts as covered if any scenario hit it. */
export function aggregateScenarioCoverageGaps(
  file: ScenarioCoverageFile
): ScenarioCoverageGap[] {
  const byFunction = new Map<
    string,
    { sourceFile: string; missed: Set<number> | null; total: number }
  >()
  for (const report of Object.values(file.scenarios ?? {})) {
    for (const fn of report.functions ?? []) {
      if (fn.status === 'unknown' || fn.totalLines === 0) continue
      let entry = byFunction.get(fn.name)
      if (!entry) {
        entry = {
          sourceFile: fn.sourceFile,
          missed: null,
          total: fn.totalLines,
        }
        byFunction.set(fn.name, entry)
      }
      const missed = new Set(fn.missedLines)
      entry.missed =
        entry.missed === null
          ? missed
          : new Set([...entry.missed].filter((line) => missed.has(line)))
    }
  }
  const gaps: ScenarioCoverageGap[] = []
  for (const [name, entry] of byFunction) {
    if (!entry.missed || entry.missed.size === 0) continue
    const missed = [...entry.missed]
    gaps.push({
      function: name,
      sourceFile: entry.sourceFile,
      status: missed.length >= entry.total ? 'uncovered' : 'partial',
      missing: collapseRanges(missed),
      missedLines: missed.length,
      totalLines: entry.total,
    })
  }
  return gaps.sort(
    (a, b) =>
      (a.status === b.status ? 0 : a.status === 'uncovered' ? -1 : 1) ||
      b.missedLines - a.missedLines ||
      a.function.localeCompare(b.function)
  )
}

type ScenarioNodes = Record<
  string,
  { rpcName?: string; input?: Record<string, unknown> }
>

function scenarioNodes(
  workflows: Record<string, unknown>
): ScenarioNodes[keyof ScenarioNodes][] {
  return Object.values(workflows).flatMap((meta) => {
    const workflow = meta as { source?: string; nodes?: ScenarioNodes }
    return workflow?.source === 'scenario'
      ? Object.values(workflow.nodes ?? {})
      : []
  })
}

/**
 * Everything a scenario measures about the app, read from the meta codegen and
 * `pikku scenario run --coverage` leave in `.pikku`.
 *
 * A mutation is a function a user changes something with: a mutating HTTP
 * route, or an exposed RPC whose name opens with a mutating verb. Only RPCs a
 * scenario can drive are required.
 */
export async function readScenarioCoverage(
  metaService: MetaService,
  { routes }: { routes?: string[] } = {}
): Promise<ScenarioCoverage> {
  const [functions, http, rpc, workflows, coverageFile] = await Promise.all([
    metaService.getFunctionsMeta(),
    metaService.getHttpMeta(),
    metaService.getRpcMeta(),
    metaService.getWorkflowMeta(),
    metaService.readFile('coverage/scenario-coverage.json'),
  ])

  const nodes = scenarioNodes(workflows)
  const driven = new Set(
    nodes.map((node) => node?.rpcName).filter((name): name is string => !!name)
  )
  const visited = [
    ...new Set(
      nodes
        .filter((node) => node?.rpcName && NAVIGATION_STEPS.has(node.rpcName))
        .map((node) => node.input?.['path'])
        .filter((path): path is string => typeof path === 'string')
        .map(normalisePath)
    ),
  ].sort()

  const invocable = new Set(Object.keys(rpc))
  const required = new Map<string, string | undefined>()
  for (const [id, meta] of Object.entries(functions)) {
    const funcId = meta.pikkuFuncId ?? id
    if (meta.functionType && meta.functionType !== 'user') continue
    if (meta.expose === false || meta.readonly === true) continue
    if (!MUTATING_VERB.test(funcId)) continue
    if (isFrameworkTagged(meta.tags) || isGenerated(meta.sourceFile)) continue
    if (!invocable.has(funcId)) continue
    required.set(funcId, meta.sourceFile)
  }
  for (const [method, wirings] of Object.entries(http)) {
    if (!MUTATING_METHODS.has(method.toLowerCase())) continue
    for (const route of Object.values(wirings ?? {})) {
      const funcId = route?.pikkuFuncId
      if (!funcId || !invocable.has(funcId)) continue
      if (isFrameworkTagged(route.tags)) continue
      const sourceFile = functions[funcId]?.sourceFile
      if (isGenerated(sourceFile)) continue
      required.set(funcId, sourceFile)
    }
  }
  const uncovered = [...required]
    .filter(([id]) => !driven.has(id))
    .map(([id, sourceFile]) => (sourceFile ? { id, sourceFile } : { id }))
    .sort((a, b) => a.id.localeCompare(b.id))

  let api: ScenarioCoverage['api'] = null
  if (coverageFile) {
    const file = JSON.parse(coverageFile) as ScenarioCoverageFile
    const total = Object.values(file.scenarios ?? {}).reduce(
      (most, one) => Math.max(most, one?.summary?.total ?? 0),
      0
    )
    if (total > 0) {
      const gaps = aggregateScenarioCoverageGaps(file)
      api = {
        generatedAt: file.generatedAt,
        environment: file.environment,
        total,
        covered: total - gaps.length,
        pct: pct(total - gaps.length, total),
        gaps,
      }
    }
  }

  const known = routes ? [...new Set(routes.map(normalisePath))].sort() : null
  return {
    api,
    mutations: {
      required: required.size,
      covered: required.size - uncovered.length,
      uncovered,
    },
    routes: {
      visited,
      total: known ? known.length : null,
      unvisited: known
        ? known.filter(
            (route) => !visited.some((path) => routeMatchesPath(route, path))
          )
        : null,
    },
  }
}
