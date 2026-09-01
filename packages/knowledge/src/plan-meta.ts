import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { z } from 'zod'
import { FIRST_PASS, scenarioPass, type Plan, type WireTransport } from './plan.js'
import { scenarioDepths, type ScenarioDepth } from './hollow-scenarios.js'

/**
 * A planned scenario that exists but cannot prove its own claim.
 *
 * Only `browser`-level claims are judged, and only against `reachability-only`. A
 * `permission` scenario proving a guard let an actor through is doing exactly its job with
 * that shape — the starter template's `signedInActorReachesTheAppScenario` is one, and
 * failing it would be wrong. A `browser` scenario says a PERSON did something on screen, so
 * navigating to a page and confirming the router left you there does not answer it.
 *
 * This is the gap the existence check cannot see: the scenario was written, so it counts as
 * delivered, and it passes its run, so the scenario gate is green — measured on the journal
 * fixture, `renWritesHowTheDayFeltScenario` shipped as `opens /app` → `is on /app`, passed
 * 5/5, and the milestone was certified with the entry-writing journey never once driven.
 */
function shallowScenarioProblem(
  level: string,
  name: string,
  claim: string,
  depths: Map<string, ScenarioDepth>
): string[] {
  if (!name) return []
  if (level !== 'browser') return []
  const depth = depths.get(name)
  if (depth === 'reachability-only') {
    return [
      `Browser scenario \`${name}\` ("${claim}") only opens a page and asserts it is still on it. That proves the route loads, not that anyone did the thing — drive the actual steps and assert what the user would see afterwards.`,
    ]
  }
  if (depth === 'no-assertion') {
    return [
      `Browser scenario \`${name}\` ("${claim}") acts and asserts nothing, so it can only fail by throwing. Assert the outcome the user would see.`,
    ]
  }
  return []
}

/**
 * Every planned scenario that exists but proves less than its level claims.
 *
 * Exported so `fabric verify` can say it as a warning mid-build without re-deriving the
 * whole shortfall — the finding is worth hearing while scenarios are still being written,
 * and `fabric build-complete` refuses on the same list at the end.
 */
export function shallowScenarioProblems(plan: Plan, meta: PikkuMeta): string[] {
  const problems: string[] = []
  for (const [level, slot] of [
    ['backend', plan.scenarios.backend],
    ['browser', plan.scenarios.browser],
    ['permission', plan.scenarios.permission],
  ] as const) {
    if (slot.kind !== 'built') continue
    for (const item of slot.items) {
      problems.push(
        ...shallowScenarioProblem(
          level,
          item.name ?? '',
          item.scenario,
          meta.depths
        )
      )
    }
  }
  return problems
}

/**
 * What the app ACTUALLY has, read from pikku's generated metadata rather than from the
 * source tree.
 *
 * Codegen already inventories eight of the nine things a plan declares — functions,
 * wires, scopes, roles, workflows, agents, personas and features — keyed by the same
 * ids the plan uses. So "did the engineer build `updateEntry`" is a set membership
 * test against a JSON file the drive already regenerates every turn, not a glob over
 * the tree and not a scenario run. Scenario PASS/FAIL still needs a run; existence
 * does not, and existence is what a pass needs at its start to know what is left.
 */
export type PikkuMeta = {
  functions: Record<string, { auth?: boolean }>
  httpRoutes: Set<string>
  scopes: Set<string>
  roles: Set<string>
  features: Record<
    string,
    { entries: Array<{ scenario: string }>; unresolvedEntries?: number }
  >
  /** Every `pikkuScenario` export codegen found, by id — what proves a planned scenario was written. */
  scenarios: Set<string>
  /** What each scenario is capable of proving, by id. See lib/hollow-scenarios.ts. */
  depths: Map<string, ScenarioDepth>
  /**
   * The functions codegen found behind a NON-http transport, by transport.
   *
   * A plan states a wire only when the function is reached some way other than its RPC,
   * and until now only `http` was ever checked back. So a plan could promise a scheduled
   * task or a workflow entry point, the build could ship the bare function, and the gate
   * would certify the milestone complete — which is why `transports: ["http",
   * "scheduler"]` has been planned and never once built.
   */
  wired: Record<PlannedTransport, Set<string>>
}

/** The transports a plan can state, minus `http`, which is checked by route. */
export type PlannedTransport = Exclude<z.infer<typeof WireTransport>, 'http'>

const WIRE_META: Record<PlannedTransport, string> = {
  queue: 'queue/pikku-queue-workers-wirings-meta.gen.json',
  channel: 'channel/pikku-channels-meta.gen.json',
  scheduler: 'scheduler/pikku-schedulers-wirings-meta.gen.json',
  workflow: 'workflow/meta',
}

/**
 * Where codegen writes its meta — the functions package when the project has one, the
 * repo root otherwise. Every caller of `readPikkuMeta` needs this same resolution, and
 * getting it wrong reads as "nothing was built" rather than as an error.
 */
export function functionsDirFor(cwd: string): string {
  return existsSync(join(cwd, 'packages/functions'))
    ? join(cwd, 'packages/functions')
    : cwd
}

const readJson = (path: string): unknown => {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.warn(`[plan-meta] unreadable ${path}: ${String(err)}`)
    return null
  }
}

const keysOf = (value: unknown): string[] =>
  value && typeof value === 'object'
    ? Object.keys(value as Record<string, unknown>)
    : []

/**
 * Every scope id the generated tree declares, colon-joined — the spelling a plan and a
 * function's `scopes: [...]` both use.
 *
 * The meta NESTS (`{admin: {scopes: {invoices: {scopes: {void: {}}}}}}`) while an id is
 * flat, so reading only the top-level keys left every nested scope permanently missing and
 * the gate unsatisfiable: run hmt2p3w7z declared its tree, cleared 15 of its 21 planned
 * items, then was refused six times for six scopes codegen had already generated — four of
 * those refusals identical — until the drive was killed.
 */
const flattenScopes = (tree: unknown, prefix = ''): string[] => {
  if (!tree || typeof tree !== 'object') return []
  const out: string[] = []
  for (const [name, node] of Object.entries(
    tree as Record<string, { scopes?: unknown }>
  )) {
    const id = prefix ? `${prefix}:${name}` : name
    out.push(id, ...flattenScopes(node?.scopes, id))
  }
  return out
}

/** The generated meta for a project, tolerating anything codegen has not produced yet. */
export function readPikkuMeta(functionsDir: string): PikkuMeta {
  const pikku = join(functionsDir, '.pikku')
  const functions = (readJson(
    join(pikku, 'function/pikku-functions-meta.gen.json')
  ) ?? {}) as Record<string, { auth?: boolean }>
  const http = readJson(
    join(pikku, 'http/pikku-http-wirings-meta.gen.json')
  ) as Record<string, Record<string, unknown>> | null
  const httpRoutes = new Set<string>()
  for (const [method, routes] of Object.entries(http ?? {})) {
    for (const route of keysOf(routes))
      httpRoutes.add(`${method.toLowerCase()} ${route}`)
  }
  return {
    functions,
    httpRoutes,
    scopes: new Set(
      flattenScopes(readJson(join(pikku, 'scopes/pikku-scopes-meta.gen.json')))
    ),
    roles: new Set(
      keysOf(readJson(join(pikku, 'scopes/pikku-roles-meta.gen.json')))
    ),
    features: (readJson(join(pikku, 'scenarios/features.gen.json')) ??
      {}) as PikkuMeta['features'],
    scenarios: new Set(
      keysOf(
        readJson(
          join(pikku, 'scenarios/pikku-scenario-functions-meta.gen.json')
        )
      )
    ),
    depths: scenarioDepths(functionsDir),
    wired: wiredFunctions(pikku, new Set(Object.keys(functions))),
  }
}

/**
 * Which functions each non-http transport actually reaches.
 *
 * Each meta names its functions differently — a queue worker and a scheduled task record
 * the function they call, a channel records its handlers, a workflow gets a file per
 * workflow — so what is collected is every function name any of them mentions. The test
 * is "does this transport reach this function at all", which is what a plan states.
 */
function wiredFunctions(
  pikku: string,
  live: ReadonlySet<string>
): Record<PlannedTransport, Set<string>> {
  const out = {} as Record<PlannedTransport, Set<string>>
  for (const [transport, rel] of Object.entries(WIRE_META) as [
    PlannedTransport,
    string,
  ][]) {
    const names = new Set<string>()
    const path = join(pikku, rel)
    const perFile = !rel.endsWith('.gen.json')
    const files = perFile
      ? existsSync(path)
        ? readdirSync(path)
            .filter((f) => f.endsWith('.gen.json'))
            .map((f) => join(path, f))
        : []
      : [path]
    for (const file of files) collectNames(readJson(file), names)
    /**
     * A directory of one file per workflow is never CLEARED before codegen rewrites it,
     * so a renamed or deleted workflow leaves its meta behind forever — verified by
     * adding a workflow to the starter template and removing it again: the orphan
     * survived `pikku all`. Left alone it discharges a wire nothing implements any more,
     * the same way `.pikku/scenarios/meta` fed dead scenario names to a run until
     * `unknownScenarios` started dropping them. The single-file metas are rewritten
     * whole, so only the per-file ones can go stale — and the functions meta is itself
     * rewritten whole, which makes it the authority on what still exists.
     */
    out[transport] = perFile
      ? new Set([...names].filter((n) => live.has(n)))
      : names
  }
  return out
}

/**
 * The function names a meta tree names, read from the keys that carry one.
 *
 * Every string in the tree is the wrong net: a workflow meta holds its own schema
 * vocabulary (`name`, `source`, `complex`, `nodes`) and a channel meta holds its route,
 * so a function called `events` or `input` would discharge a wire it never got — the gate
 * failing lax in exactly the way the http one used to. `name`, `pikkuFuncId` and `rpcName`
 * are the three keys pikku writes a function name under, across all four transports.
 *
 * A `pikkuFuncId` can carry a namespace (`pikkuWorkflowOrchestrator:allWorkflow`), so the
 * last segment goes in too: a plan names the function, never the id that wraps it. Under
 * `rpcName` a channel nests an object keyed by the names, so its keys count as well.
 */
const NAME_KEYS = new Set(['name', 'pikkuFuncId', 'rpcName'])

function addName(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    into.add(value)
    if (value.includes(':')) into.add(value.slice(value.lastIndexOf(':') + 1))
    return
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) into.add(key)
  }
}

function collectNames(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectNames(child, into)
    return
  }
  if (!node || typeof node !== 'object') return
  for (const [key, child] of Object.entries(node)) {
    if (NAME_KEYS.has(key)) addName(child, into)
    collectNames(child, into)
  }
}

/**
 * Whether a planned HTTP wire exists, comparing METHOD and path.
 *
 * The method is half the wire: `GET /entry` and `POST /entry` are different routes doing
 * different things, and a check that matched on path alone let a plan's read endpoint be
 * discharged by its write one — the plan would read as fully built with the list route
 * never wired. A plan may name the route bare (`/entry`), in which case any method
 * answers it, because that is genuinely all the plan asked for.
 *
 * Both sides are lowercased, which matters for the path and not just the method: a path
 * parameter is camelCase by convention (`/deal/:dealId/stage`), so comparing a lowercased
 * plan entry against the meta's verbatim route made EVERY parameterised wire unmatchable.
 * Measured on a crm build — the route was in the generated meta and the gate still reported
 * it missing, and the agent spent its last two turns inventing a pikku codegen fault to
 * explain a wire it had already written correctly.
 */
function isWired(planned: string, routes: Set<string>): boolean {
  const path = (r: string) => r.trim().toLowerCase().replace(/\/+$/, '') || '/'
  const declared = planned.trim().toLowerCase()
  const [head, ...rest] = declared.split(/\s+/)
  if (
    rest.length > 0 &&
    /^(get|post|put|patch|delete|head|options)$/.test(head ?? '')
  ) {
    const wanted = `${head} ${path(rest.join(' '))}`
    return [...routes].some((r) => {
      const [m, ...p] = r.split(/\s+/)
      return `${(m ?? '').toLowerCase()} ${path(p.join(' '))}` === wanted
    })
  }
  return [...routes].some((r) => path(r.split(' ')[1] ?? '') === path(declared))
}

/**
 * One row of the build checklist the console renders.
 *
 * `done` is a set-membership test against codegen's meta, never a status anything types.
 * That is the whole reason this replaced the agent's own todo list: a task the agent
 * marks `completed` says only that it claimed to finish, and run 10 is the case against
 * it — refused with four of six tasks unfinished, all four flipped to `completed` nine
 * seconds later with nothing built.
 */
export type PlanChecklistItem = {
  /** Stable across turns so the console can keep row identity as items land. */
  id: string
  /** What the plan called it — the description a reader recognises, not the symbol. */
  label: string
  kind: 'function' | 'wire' | 'scope' | 'scenario'
  done: boolean
  /**
   * Promised by a later pass, so `fabric build-complete` never asks for it.
   *
   * Set by `planShortfall`, which is the only caller that can see every pass at once —
   * `planProgress` works one pass at a time and leaves it false.
   */
  deferred: boolean
}

export type PlanProgress = {
  pass: number
  done: string[]
  missing: string[]
  problems: string[]
  /** The same reconcile as `done`/`missing`, structured for the console checklist. */
  items: PlanChecklistItem[]
}

/**
 * What is left to build in one pass, and what the meta says is wrong with what landed.
 *
 * The `auth` cross-check is the sharp one: the plan states a permission rule in prose,
 * which no checker can compare against the rule the function enforces — but meta knows
 * whether the function is gated AT ALL, so "the plan says this is restricted and the
 * function is wide open" is caught mechanically. Only the rule's meaning needs a human.
 */
export function planProgress(
  plan: Plan,
  meta: PikkuMeta,
  pass: number
): PlanProgress {
  const done: string[] = []
  const missing: string[] = []
  const problems: string[] = []
  const items: PlanChecklistItem[] = []

  const fns = plan.functions.kind === 'built' ? plan.functions.items : []
  for (const fn of fns.filter((f) => f.pass === pass)) {
    const built = meta.functions[fn.name]
    items.push({
      id: `function:${fn.name}`,
      label: fn.description,
      kind: 'function',
      done: !!built,
      deferred: false,
    })
    if (fn.wire && fn.wire.transport === 'http' && fn.wire.route) {
      items.push({
        id: `wire:${fn.wire.route}`,
        label: fn.wire.route,
        kind: 'wire',
        done: isWired(fn.wire.route, meta.httpRoutes),
        deferred: false,
      })
    } else if (fn.wire && fn.wire.transport !== 'http') {
      items.push({
        id: `wire:${fn.wire.transport}:${fn.name}`,
        label: `${fn.name} on ${fn.wire.transport}`,
        kind: 'wire',
        done: meta.wired[fn.wire.transport]?.has(fn.name) ?? false,
        deferred: false,
      })
    }
    if (!built) {
      missing.push(`function ${fn.name}`)
      continue
    }
    done.push(`function ${fn.name}`)
    if (fn.permission !== null && built.auth === false) {
      problems.push(
        `\`${fn.name}\` is planned as restricted — "${fn.permission}" — but its meta says \`auth: false\`, so anyone can call it.`
      )
    }
    if (fn.wire && fn.wire.transport === 'http' && fn.wire.route) {
      if (!isWired(fn.wire.route, meta.httpRoutes))
        missing.push(`wire ${fn.wire.route}`)
    } else if (fn.wire && fn.wire.transport !== 'http') {
      if (!meta.wired[fn.wire.transport]?.has(fn.name)) {
        missing.push(`${fn.wire.transport} wire for ${fn.name}`)
      }
    }
  }

  const scopes = plan.scopes.kind === 'built' ? plan.scopes.items : []
  for (const scope of scopes) {
    items.push({
      id: `scope:${scope.name}`,
      label: scope.description,
      kind: 'scope',
      done: meta.scopes.has(scope.name),
      deferred: false,
    })
    if (!meta.scopes.has(scope.name)) missing.push(`scope ${scope.name}`)
  }

  /**
   * The scenarios the plan promised, checked for existence.
   *
   * Without this the plan bound the build as intent but not as obligation: the gate certified
   * functions, wires, permissions and scopes, and a model that skipped the scenarios section
   * entirely lost nothing. Measured on the journal fixture — deepseek-v4-pro delivered 0 of 6
   * planned scenarios and kimi-k2.6 delivered 1, and BOTH were marked complete, because the
   * only scenario-adjacent check asked whether declared features had unwritten entries rather
   * than whether the planned scenarios were written at all.
   *
   * Deliberately existence, not pass/fail: a run answers pass/fail, and the scenario gate
   * already does that. What was missing is that a scenario nobody wrote cannot fail, so its
   * absence read as success.
   */
  for (const [level, slot] of [
    ['backend', plan.scenarios.backend],
    ['browser', plan.scenarios.browser],
    ['permission', plan.scenarios.permission],
  ] as const) {
    if (slot.kind !== 'built') continue
    for (const item of slot.items.filter(
      (i) => scenarioPass(level, i) === pass
    )) {
      if (!item.name) {
        problems.push(
          `The ${level} scenario "${item.scenario}" names no \`pikkuScenario\` export, so nothing can check it was written. Add \`name\` to it in the plan.`
        )
        continue
      }
      items.push({
        id: `scenario:${item.name}`,
        label: item.scenario,
        kind: 'scenario',
        done: meta.scenarios.has(item.name),
        deferred: false,
      })
      if (meta.scenarios.has(item.name)) done.push(`scenario ${item.name}`)
      else missing.push(`${level} scenario ${item.name} ("${item.scenario}")`)
    }
  }
  problems.push(...shallowScenarioProblems(plan, meta))

  for (const [id, feature] of Object.entries(meta.features)) {
    if ((feature.unresolvedEntries ?? 0) > 0) {
      problems.push(
        `Feature \`${id}\` declares ${feature.unresolvedEntries} scenario(s) that do not exist. A declared-but-unwritten scenario passes nothing.`
      )
    }
  }

  return { pass, done, missing, problems, items }
}

const sqlFiles = (dir: string): string[] => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sqlFiles(full)
    return e.name.endsWith('.sql') ? [full] : []
  })
}

const TABLE_STATEMENT =
  /(create|alter)\s+table\s+(?:if\s+not\s+exists\s+)?["`[]?([A-Za-z0-9_]+)["`\]]?/i

/**
 * One table under either spelling.
 *
 * A plan names its tables in camelCase, because that is what every line of TypeScript
 * that touches them uses; a migration names the same table in snake_case, because that
 * is what a column name is. Matched literally, `classBookings` never finds
 * `class_bookings`, so the cascade gate refused every table whose name is more than one
 * word — plan-probe-105130 died there, and "fixed" it by DELETING the cascade the
 * migration already had.
 */
const sameTable = (name: string): string => name.replace(/_/g, '').toLowerCase()

const RENAME_STATEMENT =
  /alter\s+table\s+["`[]?([A-Za-z0-9_]+)["`\]]?\s+rename\s+to\s+["`\]]?([A-Za-z0-9_]+)["`\]]?/i

/**
 * Every table name that a later migration renames, mapped to the name it ends up with.
 *
 * SQLite cannot add a foreign key to an existing table, so the only correct way to
 * introduce a cascade after the fact is the rebuild: create a replacement carrying the
 * constraint, copy the rows, drop the original, rename the replacement into its place.
 * That leaves the `on delete cascade` sitting in a `create table` for the TEMPORARY name,
 * which the plan never mentions — so a literal match reads the migration as absent and
 * the gate refuses a build that did exactly the right thing. Run hmt09oj7q died there,
 * rewriting the same migration on every `fabric build-complete` until it was killed.
 *
 * Chains are followed to the end so a rebuild done twice still lands on the real table.
 */
function finalTableNames(files: string[]): Map<string, string> {
  const direct = new Map<string, string>()
  for (const file of files) {
    for (const statement of readFileSync(file, 'utf8').split(';')) {
      const renamed = RENAME_STATEMENT.exec(statement)
      if (renamed) direct.set(sameTable(renamed[1]!), sameTable(renamed[2]!))
    }
  }
  const resolved = new Map<string, string>()
  for (const from of direct.keys()) {
    let to = from
    const seen = new Set<string>([from])
    while (direct.has(to)) {
      const next = direct.get(to)!
      if (seen.has(next)) break
      seen.add(next)
      to = next
    }
    resolved.set(from, to)
  }
  return resolved
}

/**
 * Whether the migrations declare a delete cascade on a table.
 *
 * Deliberately searched across every `db/**\/*.sql` rather than read from the path the
 * plan names. Migration filenames are numbered by what is already in the repo, which the
 * architect cannot know when writing the plan — the journal plan said `0001-entry.sql`
 * and the two builds correctly wrote `0003-` and `0004-`. Holding the build to a guessed
 * filename would fail every plan that got the ordering right.
 *
 * Statement-scoped, because a file that creates two tables would otherwise let a cascade
 * on one answer for the other.
 */
function declaresCascade(cwd: string, table: string): boolean {
  const wanted = sameTable(table)
  const files = sqlFiles(join(cwd, 'db'))
  const renames = finalTableNames(files)
  for (const file of files) {
    for (const statement of readFileSync(file, 'utf8').split(';')) {
      const named = TABLE_STATEMENT.exec(statement)
      if (!named) continue
      const declared = sameTable(named[2]!)
      if (declared !== wanted && renames.get(declared) !== wanted) continue
      if (/on\s+delete\s+cascade/i.test(statement)) return true
    }
  }
  return false
}

/**
 * Cascades the plan promised that the migrations do not declare.
 *
 * Separate from `planShortfall` because it reads the repo rather than codegen meta —
 * pikku's generated metadata inventories functions, wires, scopes and scenarios, but
 * nothing in it says what happens to a child row when its parent is deleted. The
 * scenario half of the promise (`provedBy`) needs no separate check: it is a planned
 * scenario like any other, so the existence check already covers it.
 */
export function cascadeProblems(plan: Plan, cwd: string): string[] {
  const problems: string[] = []
  const tables = plan.model.kind === 'built' ? plan.model.items : []
  for (const table of tables) {
    for (const rel of table.relationships) {
      if (rel.onDelete !== 'cascade') continue
      if (!declaresCascade(cwd, table.table)) {
        problems.push(
          `The plan says a \`${table.table}\` is deleted with its \`${rel.references}\` (${table.table}.${rel.column}), but no migration declares \`on delete cascade\` on \`${table.table}\`. Deleting a ${rel.references} will fail or leave the rows behind.`
        )
      }
    }
  }
  return problems
}

export type PlanShortfallResult = Omit<PlanProgress, 'pass'> & {
  /** Promised by a later pass and not built. Reported, never blocking. */
  deferred: string[]
}

/**
 * Everything the plan promised that the meta cannot find — `missing` is what BLOCKS,
 * `deferred` is what a later milestone picks up.
 *
 * `planProgress` answers "what is left in THIS pass", which is what a build turn needs
 * while it works. Completion used to be the union of every pass, so that a plan could not
 * discharge itself by declaring the unbuilt half a later pass. That defence was written
 * when the BUILD agent authored its own plan and was therefore both author and examiner;
 * the architect/builder split closed the vector, and `checkFirstPass` independently
 * requires pass 1 to be a walking skeleton that reaches a screen with a function behind it.
 *
 * What the union cost instead: a milestone ships only when every pass is done, so plan SIZE
 * became fatal. Run hmt3fz3c0 planned 14 items whose 10 permission scenarios were the role x
 * resource cross product, refused `fabric build-complete` thirteen times, and surrendered
 * with a deployed, rendering, signed-in app carrying 15 passing scenarios. Blocking on pass 1
 * alone makes an over-large plan slow rather than fatal, which is the only durable answer
 * when the budget cannot be expressed as a number of items.
 *
 * Deliberately meta-only. The ui slot has no counterpart in codegen, and the existing
 * completion gates already refuse an unrendered or unlooked-at route far better than a
 * file-exists check would; adding a weaker duplicate here would only produce a second
 * opinion to argue with.
 */
export function planShortfall(
  plan: Plan,
  meta: PikkuMeta
): PlanShortfallResult {
  const passes = new Set<number>([FIRST_PASS])
  if (plan.functions.kind === 'built')
    for (const f of plan.functions.items) passes.add(f.pass)
  for (const [level, slot] of [
    ['backend', plan.scenarios.backend],
    ['browser', plan.scenarios.browser],
    ['permission', plan.scenarios.permission],
  ] as const) {
    if (slot.kind === 'built')
      for (const i of slot.items) passes.add(scenarioPass(level, i))
  }

  const done = new Set<string>()
  const missing = new Set<string>()
  const problems = new Set<string>()
  // Keyed by id so a function declared in two passes contributes ONE checklist row —
  // the console renders these as the build's progress, and the same row twice reads as
  // two things to build.
  const items = new Map<string, PlanChecklistItem>()
  const first = planProgress(plan, meta, FIRST_PASS)
  const firstPassIds = new Set(first.items.map((item) => item.id))
  for (const pass of passes) {
    const progress = planProgress(plan, meta, pass)
    for (const d of progress.done) done.add(d)
    for (const m of progress.missing) missing.add(m)
    for (const p of progress.problems) problems.add(p)
    for (const item of progress.items) {
      items.set(item.id, { ...item, deferred: !firstPassIds.has(item.id) })
    }
  }
  const blocking = new Set(first.missing)
  return {
    done: [...done],
    missing: [...blocking],
    deferred: [...missing].filter((m) => !blocking.has(m)),
    problems: [...problems],
    items: [...items.values()],
  }
}
