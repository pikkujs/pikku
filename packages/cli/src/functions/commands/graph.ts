import { pikkuSessionlessFunc } from '#pikku/function'
import type { InspectorState } from '@pikku/inspector'
import type { FunctionMeta } from '@pikku/core/services'

/**
 * `pikku graph <functionId>`: everything the generated meta says about one
 * function, joined. It reads nothing the inspector did not already record, so
 * every edge here is one the inspector could see. The build refuses what would
 * hide an edge: computed rpc and workflow names (PKU941, PKU943), a wire passed
 * to another function (PKU942), and a call to a function or workflow that does
 * not exist (PKU944). So a function that builds is fully described here, apart
 * from callers outside the project.
 */

/** The slices of the inspector state the join reads. */
export type GraphState = Pick<
  InspectorState,
  | 'functions'
  | 'http'
  | 'channels'
  | 'gateways'
  | 'scheduledTasks'
  | 'queueWorkers'
  | 'triggers'
  | 'mcpEndpoints'
  | 'cli'
  | 'workflows'
  | 'agents'
  | 'middleware'
  | 'permissions'
>

export type GraphDefinition = {
  id: string
  description: string | null
  sourceFile: string | null
}

export type GraphGate = {
  /** `tag:x`, `http:/api/*` or `wire:name`: how the meta names the group. */
  ref: string
  /** The middleware or permission definitions behind it. Empty when none were recorded. */
  definitions: GraphDefinition[]
}

export type GraphCaller = {
  kind:
    | 'http'
    | 'channel'
    | 'gateway'
    | 'scheduler'
    | 'queue'
    | 'trigger'
    | 'triggerSource'
    | 'mcpTool'
    | 'mcpResource'
    | 'mcpPrompt'
    | 'cli'
    | 'workflow'
    | 'workflowStep'
    | 'agentTool'
    | 'function'
  /** What names the wiring: `GET /todos`, a channel or queue name, a workflow id. */
  name: string
  /** Wiring-specific facts (method, route, auth, cron, step name ...). */
  detail: Record<string, unknown>
  /** The wiring's own middleware chain, as the meta recorded it. */
  middleware: string[]
}

export type FunctionGraph = {
  function: {
    id: string
    description: string | null
    sourceFile: string | null
    bodyStart: number | null
    bodyEnd: number | null
    services: string[] | null
    servicesOptimized: boolean | null
    input: string | null
    output: string | null
    sessionless: boolean
    auth: boolean | null
    expose: boolean
    scopes: string[]
    featureFlag: string | null
    /** Set when this function is the body of a workflow. */
    workflow: string | null
  }
  callers: GraphCaller[]
  callees: {
    invokes: Array<{ id: string; description: string | null }>
    startsWorkflows: Array<{ name: string; description: string | null }>
    /** Steps, when this function is a workflow's body. */
    workflowSteps: Array<{
      step: string
      id: string
      description: string | null
    }>
  }
  gates: {
    permissions: GraphGate[]
    /** `addGlobalPermission` registrations: they apply to every function. */
    globalPermissions: GraphDefinition[]
    middleware: GraphGate[]
    /** Files with a top-level `addGlobalMiddleware`: the meta names files, not definitions. */
    globalMiddlewareFiles: string[]
    scopes: string[]
  }
}

type Entries<T> = Array<[string, T]>

/** The state may hold a Map or a plain record for the same field. */
const entriesOf = <T>(value: unknown): Entries<T> => {
  if (!value) return []
  if (value instanceof Map) return [...value.entries()] as Entries<T>
  return Object.entries(value as Record<string, T>)
}

const valuesOf = <T>(value: unknown): T[] =>
  entriesOf<T>(value).map((e) => e[1])

const getFrom = <T>(value: unknown, key: string): T | undefined => {
  if (!value) return undefined
  if (value instanceof Map) return value.get(key) as T | undefined
  return (value as Record<string, T>)[key]
}

type MiddlewareRef = {
  type: string
  route?: string
  tag?: string
  name?: string
}
type WireLike = { pikkuFuncId?: string; middleware?: MiddlewareRef[] }

const refString = (ref: MiddlewareRef): string =>
  ref.type === 'http'
    ? `http:${ref.route}`
    : ref.type === 'tag'
      ? `tag:${ref.tag}`
      : `wire:${ref.name}`

const refs = (list: MiddlewareRef[] | undefined): string[] =>
  (list ?? []).map(refString)

type Definition = {
  description?: string
  sourceFile?: string
}

const asDefinition = (
  id: string,
  def: Definition | undefined
): GraphDefinition => ({
  id,
  description: def?.description ?? null,
  sourceFile: def?.sourceFile ?? null,
})

/** Edit distance, for near matches on a mistyped id. */
const distance = (a: string, b: string): number => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      prev = row[j]
      row[j] = next
    }
  }
  return row[b.length]
}

export const nearMatches = (ids: string[], wanted: string): string[] => {
  const w = wanted.toLowerCase()
  return ids
    .map((id) => {
      const lower = id.toLowerCase()
      const contains = lower.includes(w) || w.includes(lower)
      return { id, score: contains ? 0 : distance(lower, w) }
    })
    .filter((m) => m.score === 0 || m.score <= Math.max(2, w.length / 3))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map((m) => m.id)
}

/** Resolves a middleware group reference to the definitions it stands for. */
const resolveMiddleware = (
  state: GraphState,
  ref: MiddlewareRef
): GraphDefinition[] => {
  const middleware = state.middleware
  const definitions = middleware?.definitions
  const instances = middleware?.instances
  const viaGroup = (group: { instanceIds?: string[] } | undefined) =>
    (group?.instanceIds ?? []).map((instanceId) => {
      const definitionId =
        getFrom<{ definitionId: string }>(instances, instanceId)
          ?.definitionId ?? instanceId
      return asDefinition(
        definitionId,
        getFrom<Definition>(definitions, definitionId)
      )
    })
  if (ref.type === 'tag') {
    return viaGroup(getFrom(middleware?.tagMiddleware, ref.tag ?? ''))
  }
  if (ref.type === 'http') {
    return viaGroup(getFrom(state.http?.routeMiddleware, ref.route ?? ''))
  }
  const def = getFrom<Definition>(definitions, ref.name ?? '')
  return def ? [asDefinition(ref.name ?? '', def)] : []
}

const describe = (meta: Record<string, FunctionMeta> | undefined, id: string) =>
  meta?.[id]?.description ?? null

/** Walks workflow DSL steps, which nest inside branches, fanouts and parallel groups. */
const dslRpcSteps = (
  steps: unknown,
  out: Array<{ step: string; id: string }> = []
): Array<{ step: string; id: string }> => {
  if (!Array.isArray(steps)) return out
  for (const s of steps as any[]) {
    if (!s || typeof s !== 'object') continue
    if (s.type === 'rpc' && typeof s.rpcName === 'string') {
      out.push({ step: s.stepName ?? s.rpcName, id: s.rpcName })
    } else if (s.type === 'scenarioStep' && typeof s.stepFunc === 'string') {
      out.push({ step: s.stepName ?? s.stepFunc, id: s.stepFunc })
    }
    for (const key of ['children', 'body', 'elseSteps'])
      dslRpcSteps(s[key], out)
    for (const b of s.branches ?? []) dslRpcSteps(b?.steps, out)
    for (const c of s.cases ?? []) dslRpcSteps(c?.steps, out)
  }
  return out
}

/** Function nodes of every workflow, from the graph form, falling back to the DSL steps. */
const workflowSteps = (
  state: GraphState,
  workflowName: string
): Array<{ step: string; id: string }> => {
  const graph = getFrom<{ nodes?: Record<string, any> }>(
    state.workflows?.graphMeta,
    workflowName
  )
  if (graph?.nodes) {
    return Object.entries(graph.nodes)
      .filter(([, n]) => typeof n?.rpcName === 'string')
      .map(([nodeId, n]) => ({ step: n.stepName ?? nodeId, id: n.rpcName }))
  }
  const wf = getFrom<{ steps?: unknown }>(state.workflows?.meta, workflowName)
  return dslRpcSteps(wf?.steps)
}

export const buildFunctionGraph = (
  state: GraphState,
  functionId: string
): FunctionGraph => {
  const fnMeta = state.functions?.meta as Record<string, FunctionMeta>
  const m = fnMeta?.[functionId]
  if (!m) {
    const near = nearMatches(Object.keys(fnMeta ?? {}), functionId)
    throw new Error(
      `Function not found: ${functionId}` +
        (near.length ? `. Did you mean: ${near.join(', ')}?` : '')
    )
  }

  const callers: GraphCaller[] = []
  const add = (caller: GraphCaller) => callers.push(caller)
  const mine = (w: WireLike | null | undefined) => w?.pikkuFuncId === functionId

  for (const [method, routes] of entriesOf<Record<string, any>>(
    state.http?.meta
  )) {
    for (const [route, w] of entriesOf<any>(routes)) {
      if (!mine(w)) continue
      add({
        kind: 'http',
        name: `${method.toUpperCase()} ${route}`,
        detail: {
          method,
          route,
          auth: w.auth ?? null,
          requiresSession: w.requiresSession ?? null,
          sse: w.sse ?? false,
        },
        middleware: refs(w.middleware),
      })
    }
  }

  for (const [name, c] of entriesOf<any>(state.channels?.meta)) {
    const handlers: Array<[string, WireLike | null | undefined]> = [
      ['connect', c.connect],
      ['disconnect', c.disconnect],
      ['message', c.message],
    ]
    for (const [action, routes] of entriesOf<Record<string, WireLike>>(
      c.messageWirings
    )) {
      for (const [key, w] of entriesOf<WireLike>(routes)) {
        handlers.push([`${action}.${key}`, w])
      }
    }
    for (const [handler, w] of handlers) {
      if (!mine(w)) continue
      add({
        kind: 'channel',
        name,
        detail: { handler, route: c.route, auth: c.auth ?? null },
        middleware: refs([...(c.middleware ?? []), ...(w?.middleware ?? [])]),
      })
    }
  }

  for (const [name, g] of entriesOf<any>(state.gateways?.meta)) {
    if (!mine(g)) continue
    add({
      kind: 'gateway',
      name,
      detail: { type: g.type, route: g.route ?? null, auth: g.auth ?? null },
      middleware: refs(g.middleware),
    })
  }

  for (const [name, t] of entriesOf<any>(state.scheduledTasks?.meta)) {
    if (!mine(t)) continue
    add({
      kind: 'scheduler',
      name,
      detail: { schedule: t.schedule ?? null },
      middleware: refs(t.middleware),
    })
  }

  for (const [name, q] of entriesOf<any>(state.queueWorkers?.meta)) {
    if (!mine(q)) continue
    add({ kind: 'queue', name, detail: {}, middleware: refs(q.middleware) })
  }

  for (const [name, t] of entriesOf<any>(state.triggers?.meta)) {
    if (!mine(t)) continue
    add({ kind: 'trigger', name, detail: {}, middleware: refs(t.middleware) })
  }
  for (const [name, t] of entriesOf<any>(state.triggers?.sourceMeta)) {
    if (!mine(t)) continue
    add({ kind: 'triggerSource', name, detail: {}, middleware: [] })
  }

  const mcp: Array<[GraphCaller['kind'], unknown]> = [
    ['mcpTool', state.mcpEndpoints?.toolsMeta],
    ['mcpResource', state.mcpEndpoints?.resourcesMeta],
    ['mcpPrompt', state.mcpEndpoints?.promptsMeta],
  ]
  for (const [kind, group] of mcp) {
    for (const [name, e] of entriesOf<any>(group)) {
      if (!mine(e)) continue
      add({
        kind,
        name,
        detail: { surface: e.surface ?? null },
        middleware: refs(e.middleware),
      })
    }
  }

  const walkCli = (
    program: string,
    path: string[],
    commands: Record<string, any> | undefined
  ) => {
    for (const [cmd, c] of entriesOf<any>(commands)) {
      const here = [...path, cmd]
      if (mine(c)) {
        add({
          kind: 'cli',
          name: `${program} ${here.join(' ')}`,
          detail: { program, command: here },
          middleware: refs(c.middleware),
        })
      }
      walkCli(program, here, c.subcommands)
    }
  }
  for (const [program, p] of entriesOf<any>(state.cli?.meta?.programs)) {
    walkCli(program, [], p?.commands)
  }

  let workflowName: string | null = null
  for (const [name, wf] of entriesOf<any>(state.workflows?.meta)) {
    if (mine(wf)) {
      workflowName = name
      add({
        kind: 'workflow',
        name,
        detail: {},
        middleware: refs(wf.middleware),
      })
    }
    for (const s of workflowSteps(state, name)) {
      if (s.id === functionId) {
        add({
          kind: 'workflowStep',
          name,
          detail: { workflow: name, step: s.step },
          middleware: [],
        })
      }
    }
  }

  for (const [name, a] of entriesOf<any>(state.agents?.agentsMeta)) {
    if ((a?.tools ?? []).includes(functionId)) {
      add({ kind: 'agentTool', name, detail: {}, middleware: [] })
    }
  }

  for (const [id, other] of Object.entries(fnMeta)) {
    if (id === functionId) continue
    const invokes = other.invokes ?? []
    if (invokes.includes(functionId)) {
      add({
        kind: 'function',
        name: id,
        detail: { via: 'invokes' },
        middleware: [],
      })
    }
    if (workflowName && (other.startsWorkflows ?? []).includes(workflowName)) {
      add({
        kind: 'function',
        name: id,
        detail: { via: 'startsWorkflows', workflow: workflowName },
        middleware: [],
      })
    }
  }
  if (workflowName) {
    for (const [name, a] of entriesOf<any>(state.agents?.agentsMeta)) {
      if ((a?.workflows ?? []).includes(workflowName)) {
        add({
          kind: 'agentTool',
          name,
          detail: { via: 'workflows', workflow: workflowName },
          middleware: [],
        })
      }
    }
  }

  const invokes = (m.invokes ?? []).map((id) => ({
    id,
    description: describe(fnMeta, id),
  }))
  const workflowsMeta = state.workflows?.meta as Record<string, any> | undefined
  const startsWorkflows = (m.startsWorkflows ?? []).map((name) => ({
    name,
    description: workflowsMeta?.[name]?.description ?? null,
  }))
  const steps = workflowName
    ? workflowSteps(state, workflowName).map((s) => ({
        step: s.step,
        id: s.id,
        description: describe(fnMeta, s.id),
      }))
    : []
  const permissionDefs = state.permissions?.definitions
  const permissions: GraphGate[] = (m.permissions ?? []).map((p) => {
    const def = getFrom<Definition>(permissionDefs, p.name)
    return {
      ref: `wire:${p.name}`,
      definitions: def ? [asDefinition(p.name, def)] : [],
    }
  })

  // The function's own chain, then each wiring's, without repeating a group.
  const seen = new Set<string>()
  const middleware: GraphGate[] = []
  const allRefs: MiddlewareRef[] = [
    ...((m.middleware ?? []) as MiddlewareRef[]),
  ]
  const wiringRefs = new Set(callers.flatMap((c) => c.middleware))
  for (const ref of wiringRefs) {
    const [type, rest] = [
      ref.slice(0, ref.indexOf(':')),
      ref.slice(ref.indexOf(':') + 1),
    ]
    allRefs.push(
      type === 'http'
        ? { type, route: rest }
        : type === 'tag'
          ? { type, tag: rest }
          : { type: 'wire', name: rest }
    )
  }
  for (const ref of allRefs) {
    const key = refString(ref)
    if (seen.has(key)) continue
    seen.add(key)
    const definitions = resolveMiddleware(state, ref)
    middleware.push({ ref: key, definitions })
  }

  const globalPermissions = valuesOf<{ definitionIds?: string[] }>(
    state.permissions?.global
  ).flatMap((g) =>
    (g.definitionIds ?? []).map((id) =>
      asDefinition(id, getFrom<Definition>(permissionDefs, id))
    )
  )
  const globalMiddlewareFiles = [
    ...((state.middleware?.globalFiles as Iterable<string> | undefined) ?? []),
  ].sort()

  return {
    function: {
      id: functionId,
      description: m.description ?? null,
      sourceFile: m.sourceFile ?? null,
      bodyStart: m.bodyStart ?? null,
      bodyEnd: m.bodyEnd ?? null,
      services: m.services?.services ?? null,
      servicesOptimized: m.services?.optimized ?? null,
      input: m.inputSchemaName ?? null,
      output: m.outputSchemaName ?? null,
      sessionless: m.sessionless === true,
      auth: m.auth ?? null,
      expose: m.expose === true,
      scopes: m.scopes ?? [],
      featureFlag: m.featureFlag ?? null,
      workflow: workflowName,
    },
    callers,
    callees: { invokes, startsWorkflows, workflowSteps: steps },
    gates: {
      permissions,
      globalPermissions,
      middleware,
      globalMiddlewareFiles,
      scopes: m.scopes ?? [],
    },
  }
}

const list = (items: string[]) => (items.length ? items.join(', ') : 'none')

/** A short human form of the graph. `--json` carries everything. */
export const formatFunctionGraph = (g: FunctionGraph): string => {
  const f = g.function
  const lines = [
    `${f.id}${f.description ? `  ${f.description}` : ''}`,
    `  ${f.sourceFile ?? '?'}${f.bodyStart ? `:${f.bodyStart}-${f.bodyEnd}` : ''}`,
    `  input ${f.input ?? '-'}  output ${f.output ?? '-'}  ${f.sessionless ? 'sessionless' : 'session'}  services ${list(f.services ?? [])}`,
    '',
    `callers (${g.callers.length})`,
    ...g.callers.map((c) => {
      const extra = Object.entries(c.detail)
        .filter(([, v]) => v !== null && v !== false)
        .map(
          ([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`
        )
        .join(' ')
      return `  ${c.kind.padEnd(12)} ${c.name}${extra ? `  (${extra})` : ''}`
    }),
    '',
    'callees',
    ...g.callees.invokes.map((i) => `  invokes      ${i.id}`),
    ...g.callees.startsWorkflows.map((w) => `  starts       ${w.name}`),
    ...g.callees.workflowSteps.map(
      (s) => `  step         ${s.step} -> ${s.id}`
    ),
    '',
    'gates',
    `  permissions  ${list(g.gates.permissions.map((p) => p.ref))}`,
    `  global perms ${list(g.gates.globalPermissions.map((p) => p.id))}`,
    `  middleware   ${list(g.gates.middleware.map((m) => m.ref))}`,
    `  scopes       ${list(g.gates.scopes)}`,
  ]
  return lines.join('\n')
}

export type GraphInput = {
  functionId: string
  json?: boolean
  output?: string
}

export const pikkuGraph = pikkuSessionlessFunc<GraphInput, void>({
  func: async ({ getInspectorState }, data) => {
    const state = await getInspectorState()
    const graph = buildFunctionGraph(state, data.functionId)
    if (data.json || data.output === 'json') {
      console.log(JSON.stringify(graph))
    } else {
      console.log(formatFunctionGraph(graph))
    }
  },
})
