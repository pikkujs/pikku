/**
 * Make blueprint → the `ParsedWorkflow` IR that `@pikku/n8n-import`'s codegen
 * consumes.
 *
 * The bet this file makes: codegen, topology, naming and the expression
 * classifier are engine-agnostic in everything but their INPUT SHAPE. So rather
 * than fork 1,600 lines, we normalize Make onto the n8n IR — synthesizing an
 * n8n-shaped `connections` map from Make's nested `flow`/`routes`/`branches`,
 * and bridging IML into n8n expression syntax (see `iml.ts`).
 *
 * Topology mapping:
 *   linear flow          module N → module N+1                  (chain)
 *   builtin:BasicRouter  router → EVERY route head in one slot  (non-exclusive
 *                        fan-out — n8n's `main[0] = [a, b, c]` has exactly these
 *                        semantics: all targets fire for the same item)
 *   builtin:BasicIfElse  ifelse → every branch head             (⚠ v1: emitted as
 *                        fan-out too; the exclusivity is NOT yet enforced — see
 *                        `diagnostics`)
 *   onerror              nested error flow                      (⚠ v1: dropped)
 */

// NOTE (spike): imported from n8n-import's SOURCE rather than the `@pikku/n8n-import`
// package entry. The package only exports `./dist/index.js`, and these live behind
// that barrel. Proper wiring (workspace resolution + a real shared-core package) is
// the follow-up — the fact that a second importer immediately reaches for naming,
// types and codegen is precisely the argument for extracting them.
import {
  sanitizeIdentifier,
  dedupe,
  integrationRpcName,
  codeRpcName,
} from '../../n8n-import/src/naming.js'
import type {
  N8nConnections,
  ParsedNode,
  ParsedWorkflow,
  NodeRole,
} from '../../n8n-import/src/types.js'
import { bridgeMapper, hasNestedRef } from './iml.js'
import { lowerFilter } from './filter.js'
import {
  BUILTIN_NAMESPACES,
  splitModule,
  TRIGGER_OPERATIONS,
  type MakeBlueprint,
  type MakeExport,
  type MakeModule,
} from './types.js'

export interface MakeParseWarning {
  kind:
    | 'router-filter-dropped'
    | 'router-filter-unlowerable'
    | 'router-filter-lossy'
    | 'ifelse-not-exclusive'
    | 'onerror-dropped'
    | 'nested-ref'
    | 'aggregator-feeder'
  module: string
  detail?: string
}

export interface ParsedMakeWorkflow extends ParsedWorkflow {
  /** Make-specific lossiness, surfaced rather than silently swallowed. */
  warnings: MakeParseWarning[]
  /** Distinct `app:operation` module ids seen, for coverage reporting. */
  modulesSeen: string[]
  /**
   * The blueprint carries semantics we cannot reproduce, and no safe degradation
   * exists (an un-lowerable route gate). The workflow must NOT be emitted.
   */
  fatal: boolean
}

export class UnsupportedBlueprintError extends Error {}

/** Unwrap the export envelope — the API nests under `blueprint`; some files don't. */
export function toBlueprint(raw: unknown): MakeBlueprint {
  if (!raw || typeof raw !== 'object') {
    throw new UnsupportedBlueprintError('not an object')
  }
  const e = raw as MakeExport
  const bp = e.blueprint ?? (e.flow ? (e as MakeBlueprint) : undefined)
  if (!bp?.flow || !Array.isArray(bp.flow) || bp.flow.length === 0) {
    throw new UnsupportedBlueprintError('no blueprint.flow')
  }
  return bp
}

/** Is this module a scenario trigger (its output becomes the graph's `trigger`)? */
function isTrigger(mod: MakeModule, index: number): boolean {
  const { app, operation } = splitModule(mod.module)
  if (app === 'gateway') return true // CustomWebHook / CustomMailHook
  return index === 0 && TRIGGER_OPERATIONS.test(operation)
}

function roleFor(mod: MakeModule, index: number): NodeRole {
  if (isTrigger(mod, index)) return 'trigger'
  const { app, operation } = splitModule(mod.module)
  if (app === 'code') return 'code'
  if (app === 'builtin' && operation === 'BasicIfElse') return 'branch'
  // Routers/Merges are pure topology — they carry no work of their own.
  if (app === 'builtin' && (operation === 'BasicRouter' || operation === 'BasicMerge')) {
    return 'noop'
  }
  // Builtins would ideally be `native`, but codegen resolves native specs via
  // `nativeSpecFor(typeShort)` against n8n's type names. Until a Make native-map
  // exists they degrade to stubs — the same graceful path n8n-import uses for an
  // unmapped resource/operation.
  if (BUILTIN_NAMESPACES.has(app)) return 'integration'
  return 'integration'
}

/**
 * Module id of a Filter node we synthesize (not a real Make module). Route gates
 * are hoisted onto these; see `filter.ts`.
 */
const SYNTHETIC_FILTER = 'make:filter'

interface Walked {
  mod: MakeModule
  /** Ids this module hands control to. */
  next: number[]
}

/** Synthetic ids count DOWN from -1 so they can never collide with Make's own. */
interface SynthIds {
  next: number
}

/**
 * Flatten the nested blueprint into a module list plus an id→id edge map.
 * Recurses into `routes[].flow` and `branches[].flow`.
 */
function walk(
  flow: MakeModule[],
  out: Map<number, Walked>,
  warnings: MakeParseWarning[],
  synth: SynthIds
): { head?: number; tail?: number } {
  let head: number | undefined
  let prev: Walked | undefined

  for (const mod of flow) {
    if (typeof mod?.id !== 'number' || typeof mod?.module !== 'string') continue
    const node: Walked = { mod, next: [] }
    out.set(mod.id, node)
    if (head === undefined) head = mod.id
    if (prev) prev.next.push(mod.id)
    prev = node

    const { app, operation } = splitModule(mod.module)

    if (mod.routes?.length) {
      // Router: every route head fires for the same bundle (non-exclusive) —
      // which is exactly n8n's `main[0] = [a, b, c]` fan-out. But a route whose
      // head carries a `filter` is GATED, and fan-out alone would run it
      // unconditionally. Each gate is hoisted into a synthesized Filter node
      // spliced between the router and the route head, so a false result
      // dead-ends the route instead of firing it.
      for (const route of mod.routes) {
        if (!route.flow?.length) continue
        const sub = walk(route.flow, out, warnings, synth)
        if (sub.head === undefined) continue

        const gate = route.flow[0]?.filter
        if (!gate?.conditions?.length) {
          node.next.push(sub.head)
          continue
        }

        const id = synth.next--
        out.set(id, {
          mod: { id, module: SYNTHETIC_FILTER, filter: gate },
          next: [sub.head],
        })
        node.next.push(id)
      }
      // Routes are terminal — a router cannot merge back.
      prev = undefined
      continue
    }

    if (mod.branches?.length) {
      for (const br of mod.branches) {
        if (!br.flow?.length) continue
        const sub = walk(br.flow, out, warnings, synth)
        if (sub.head !== undefined) node.next.push(sub.head)
      }
      warnings.push({
        kind: 'ifelse-not-exclusive',
        module: mod.module,
        detail: `${mod.branches.length} branches emitted as fan-out`,
      })
      // BasicIfElse converges into the following BasicMerge, so `prev` stays.
    }

    if (mod.onerror?.length) {
      warnings.push({ kind: 'onerror-dropped', module: mod.module })
    }

    if (app === 'builtin' && operation === 'BasicAggregator') {
      const feeder = mod.parameters?.['feeder']
      if (feeder !== undefined) {
        warnings.push({
          kind: 'aggregator-feeder',
          module: mod.module,
          detail: `feeder=${String(feeder)}`,
        })
      }
    }
  }

  return { head, tail: prev?.mod.id }
}

export function parseMake(raw: unknown, fallbackName = 'workflow'): ParsedMakeWorkflow {
  const bp = toBlueprint(raw)
  const warnings: MakeParseWarning[] = []
  let fatal = false

  const walked = new Map<number, Walked>()
  walk(bp.flow!, walked, warnings, { next: -1 })
  if (walked.size === 0) throw new UnsupportedBlueprintError('no modules')

  // --- name every module (IML addresses modules by id, so build id → name) ---
  const seen = new Set<string>()
  const idToName = new Map<number, string>()
  const order = [...walked.keys()]
  for (const id of order) {
    const { mod } = walked.get(id)!
    const { app } = splitModule(mod.module)
    const desired =
      mod.metadata?.designer?.name?.trim() || `${app.replace(/[^a-z0-9]+/gi, ' ')} ${id}`
    idToName.set(id, dedupe(sanitizeIdentifier(desired) || `m${id}`, seen))
  }

  // --- build ParsedNodes ---
  const nodes: ParsedNode[] = []
  const modulesSeen = new Set<string>()
  /** Synthetic gates we could not lower — their edges collapse through. */
  const droppedGates = new Set<number>()
  let index = 0
  for (const id of order) {
    const { mod } = walked.get(id)!
    const { app, operation } = splitModule(mod.module)
    if (mod.module !== SYNTHETIC_FILTER) modulesSeen.add(mod.module)

    const name = idToName.get(id)!

    // A synthesized Filter carrying a hoisted route gate. Emitted as an n8n
    // Filter node (`typeShort: 'filter'`) so `branch.ts` normalizes it to a
    // single case on slot 0 with no fallback — false dead-ends the route.
    if (mod.module === SYNTHETIC_FILTER) {
      const lowered = mod.filter ? lowerFilter(mod.filter, idToName) : null
      if (!lowered) {
        // We cannot reproduce this gate's truth table. There is no safe fallback:
        // emitting the route UNGATED makes it fire on every bundle, and a gated
        // route is often destructive (`deleteAnEvent`, `updateRow`). Dropping the
        // route silently loses behaviour. So the workflow is un-importable —
        // fail loudly rather than emit something that corrupts data.
        warnings.push({
          kind: 'router-filter-unlowerable',
          module: SYNTHETIC_FILTER,
          detail: mod.filter?.name ?? 'unnamed',
        })
        fatal = true
        droppedGates.add(id)
        continue
      }
      if (lowered.lossy) {
        warnings.push({
          kind: 'router-filter-lossy',
          module: SYNTHETIC_FILTER,
          detail: lowered.lossy,
        })
      }
      nodes.push({
        id: String(id),
        name,
        nodeId: name,
        type: SYNTHETIC_FILTER,
        typeShort: 'filter',
        parameters: lowered.parameters,
        notes: mod.filter?.name,
        disabled: false,
        role: 'branch',
        rpcName: name,
      })
      index++
      continue
    }

    const role = roleFor(mod, index++)

    // Make splits config (`parameters`) from data inputs (`mapper`). n8n has one
    // bag, and only mapper values carry IML — so bridge mapper, pass config through.
    const mapper = bridgeMapper(mod.mapper ?? {}, idToName) as Record<string, unknown>
    if (hasNestedRef(mapper)) {
      warnings.push({ kind: 'nested-ref', module: mod.module })
    }
    const parameters = { ...(mod.parameters ?? {}), ...mapper }

    const rpcName =
      role === 'code' ? codeRpcName(name) : integrationRpcName(operation || app, name)

    nodes.push({
      id: String(id),
      name,
      nodeId: name,
      type: mod.module,
      typeShort: operation || app,
      typeVersion: mod.version,
      parameters,
      notes: mod.metadata?.designer?.name,
      disabled: false,
      role,
      rpcName,
    })
  }

  // --- synthesize n8n-shaped connections (keyed by SOURCE NAME) ---
  /** Collapse an edge through a gate we refused to emit: router → gate → head. */
  const resolveTarget = (t: number): number[] =>
    droppedGates.has(t) ? (walked.get(t)?.next ?? []) : [t]

  const connections: N8nConnections = {}
  for (const id of order) {
    const w = walked.get(id)!
    if (droppedGates.has(id)) continue
    if (w.next.length === 0) continue
    const from = idToName.get(id)!
    connections[from] = {
      main: [
        w.next
          .flatMap(resolveTarget)
          .filter((t) => idToName.has(t))
          .map((t) => ({ node: idToName.get(t)!, type: 'main', index: 0 })),
      ],
    }
  }

  const name = bp.name?.trim() || fallbackName
  return {
    name,
    slug: sanitizeIdentifier(name) || 'workflow',
    nodes,
    connections,
    stickyNotes: [],
    shape: 'pure-graph',
    warnings,
    fatal,
    modulesSeen: [...modulesSeen],
  }
}
