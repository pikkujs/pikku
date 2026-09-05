import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// How much a scenario PROVES, read statically off pikku's generated step meta — one JSON
// read per scenario, no browser, no dev server, no instrumentation. Cheap enough for a
// mid-build check rather than only the closing gate.
//
// `scenario-rpc-coverage.ts` answers which mutations a journey drives. It is blind to a
// browser journey twice over: the scenario drives no RPC, so it contributes nothing there
// and nothing there can judge it. Measured on the journal fixture,
// `renWritesHowTheDayFeltScenario` reduced to `opens /app` → `is on /app` and passed 5/5
// while RPC coverage stayed green (the backend scenario already covered `saveEntry`).
//
// The trap this walked into first: that shape is NOT hollow by itself. `opensPage` reports
// where the browser LANDED rather than forcing it, so `is on /app` genuinely asserts that
// the route guard did not bounce a signed-in actor to `/app/login` — it is precisely the
// starter template's `signedInActorReachesTheAppScenario`, which is honest work. The two
// scenarios are structurally identical and differ only in what they CLAIM, so depth is
// reported here and judged against the plan's claim in `plan-meta.ts`, never alone.

/** Where per-scenario step meta lands; mirrors scenario-rpc-coverage.ts. */
const SCENARIO_META_DIRS = ['.pikku/scenarios/meta', '.pikku/workflow/meta']

const metaDirs = (cwd: string): string[] =>
  [process.env.PIKKU_DEV_DIR, join(cwd, 'packages/functions'), cwd].filter(
    (d): d is string => !!d
  )

/** Steps that only move the browser. Landing somewhere is not evidence of doing anything. */
const NAVIGATION_STEPS = new Set(['opensPage'])

type ScenarioNode = {
  rpcName?: string
  scenarioStepPhase?: string
  input?: Record<string, unknown>
  next?: string
}
type ScenarioMeta = {
  name?: string
  source?: string
  nodes?: Record<string, ScenarioNode>
  entryNodeIds?: string[]
}

/**
 * What a scenario is capable of proving.
 *
 * - `asserts` — it drives something and checks a fact it could not have assumed.
 * - `reachability-only` — it navigates, then asserts it is on a page it opened. Real proof
 *   that a guard let the actor through, and nothing more. Legitimate for an auth scenario,
 *   a lie when it stands in for a user doing something.
 * - `no-assertion` — it acts and checks nothing. pikku fails this at inspection (PKU680,
 *   critical as of inspector 0.12.52); reported anyway because that severity is a property
 *   of the CLI version in the sandbox, not of this build.
 * - `not-judged` — no acting step (a `given`-only fixture), or not a scenario.
 */
export type ScenarioDepth =
  'asserts' | 'reachability-only' | 'no-assertion' | 'not-judged'

/** `/app/` and `/app` are the same route — the step itself compares them this way. */
const normalisePath = (path: string) => path.replace(/\/+$/, '') || '/'

/**
 * Walk from the entry node so "already opened" means what it says. Key order happens to
 * match today, but nodes are a linked graph and an order-dependent test would quietly
 * invert on any codegen change.
 */
function orderedNodes(meta: ScenarioMeta): ScenarioNode[] {
  const nodes = meta.nodes ?? {}
  const ordered: ScenarioNode[] = []
  const seen = new Set<string>()
  let id = meta.entryNodeIds?.[0]
  while (id && nodes[id] && !seen.has(id)) {
    seen.add(id)
    ordered.push(nodes[id]!)
    id = nodes[id]!.next
  }
  // Branching graphs (and any node the chain misses) still get judged — a scenario must
  // never be assessed on a fraction of itself.
  for (const [key, node] of Object.entries(nodes))
    if (!seen.has(key)) ordered.push(node)
  return ordered
}

export function classifyScenario(meta: ScenarioMeta): ScenarioDepth {
  if (meta.source !== 'scenario') return 'not-judged'
  const nodes = orderedNodes(meta)
  const acting = nodes.filter((node) => node.scenarioStepPhase === 'when')
  if (acting.length === 0) return 'not-judged'

  const opened = new Set<string>()
  let assertions = 0
  let beyondReachability = 0

  for (const node of nodes) {
    if (node.rpcName && NAVIGATION_STEPS.has(node.rpcName)) {
      const path = node.input?.['path']
      if (typeof path === 'string') opened.add(normalisePath(path))
    }
    if (node.scenarioStepPhase !== 'then') continue
    assertions += 1
    const path = node.input?.['path']
    const restatesOpenedPage =
      node.rpcName === 'restsOnPath' &&
      typeof path === 'string' &&
      opened.has(normalisePath(path))
    if (!restatesOpenedPage) beyondReachability += 1
  }

  if (assertions === 0) return 'no-assertion'
  if (beyondReachability > 0) return 'asserts'
  // Only meaningful when navigation is ALSO all it did — a scenario that submits a form and
  // then checks it stayed put has driven real work, whatever its assertion looks like.
  const onlyNavigated = acting.every(
    (node) => node.rpcName && NAVIGATION_STEPS.has(node.rpcName)
  )
  return onlyNavigated ? 'reachability-only' : 'asserts'
}

/**
 * Every scenario in the project by `pikkuScenario` export id → what it can prove.
 *
 * Fails OPEN on missing or unreadable meta, like every gate that reads codegen output: an
 * absent file means codegen has not run, not that the app proves nothing.
 */
export function scenarioDepths(cwd: string): Map<string, ScenarioDepth> {
  const depths = new Map<string, ScenarioDepth>()
  const dirs = metaDirs(cwd)
    .flatMap((dir) => SCENARIO_META_DIRS.map((rel) => join(dir, rel)))
    .filter((dir) => existsSync(dir))
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.gen.json') || file.endsWith('-verbose.gen.json'))
        continue
      let meta: ScenarioMeta
      try {
        meta = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      } catch {
        continue
      }
      const depth = classifyScenario(meta)
      if (meta.name && depth !== 'not-judged') depths.set(meta.name, depth)
    }
  }
  return depths
}
