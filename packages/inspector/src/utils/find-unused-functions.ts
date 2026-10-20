import type { InspectorState } from '../types.js'

export interface UnusedFunction {
  pikkuFuncId: string
  name?: string
  sourceFile?: string
}

/** Scenarios and their steps are run by the scenario runner, never wired or called. */
const RUN_BY_SCENARIOS = new Set([
  'pikkuScenario',
  'pikkuScenarioStep',
  'pikkuPlatformScenarioStep',
  'pikkuAddonScenarioStep',
])

/** Sections that describe functions rather than use them. */
const NOT_USES = new Set([
  'functions',
  'schemas',
  'schemaLookup',
  'serviceAggregation',
  'nodes',
  'resolvedIOTypes',
  'addonFunctions',
  'remoteAddonFunctions',
  'program',
  'stats',
])

/** Keys under which a wiring names the function it runs. */
const FUNCTION_KEYS = new Set(['pikkuFuncId', 'rpcName', 'receive'])

const collectUses = (
  value: unknown,
  into: Set<string>,
  seen: WeakSet<object>,
  key?: string
): void => {
  if (typeof value === 'string') {
    if (key && FUNCTION_KEYS.has(key)) into.add(value)
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (value instanceof Map) {
    for (const child of value.values()) collectUses(child, into, seen)
    return
  }
  if (value instanceof Set) return
  if (Array.isArray(value)) {
    for (const child of value) {
      if (key === 'tools' && typeof child === 'string') into.add(child)
      else collectUses(child, into, seen)
    }
    return
  }
  // Only plain data: the TypeScript inspector's state also holds compiler
  // objects (types, nodes) whose getters throw when read.
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return
  for (const [childKey, child] of Object.entries(value)) {
    collectUses(child, into, seen, childKey)
  }
}

/**
 * The app's own functions that nothing uses: not wired to any transport, not
 * exposed, published or offered to MCP, and not called by name. Addon
 * functions are never judged: an addon project's own functions are all addon
 * functions, and a consumer's state holds no addon functions in
 * `functions.meta`. Neither are scenarios, inline wiring functions or disabled
 * functions. A workflow is a function like any other: it is used when it is
 * wired, exposed, or started by a literal name — `rpc.startWorkflow`,
 * `workflowService.startWorkflow` / `runToCompletion`, `rpc.invoke`, another
 * workflow's step, or the generated client helpers.
 */
export const findUnusedFunctions = (
  state: InspectorState,
  { addon = false }: { addon?: boolean } = {}
): UnusedFunction[] => {
  if (addon) return []
  const uses = new Set<string>(state.serviceAggregation.usedFunctions)
  for (const name of state.rpc.invokedFunctions) uses.add(name)
  for (const id of Object.values(state.rpc.exposedMeta)) uses.add(id)
  const seen = new WeakSet<object>()
  for (const [section, value] of Object.entries(state)) {
    if (NOT_USES.has(section) || section === 'rpc' || section === 'workflows')
      continue
    collectUses(value, uses, seen)
  }
  // A workflow's own meta and graph name the workflow itself; only what its
  // steps call counts as a use.
  const { meta: workflowsMeta, graphMeta } = state.workflows
  for (const entries of [workflowsMeta, graphMeta] as Array<
    Record<string, { pikkuFuncId?: string; name?: string }>
  >) {
    for (const [workflowName, entry] of Object.entries(entries ?? {})) {
      const calls = new Set<string>()
      collectUses(entry, calls, seen)
      calls.delete(workflowName)
      if (entry?.pikkuFuncId) calls.delete(entry.pikkuFuncId)
      for (const call of calls) uses.add(call)
    }
  }
  // Workflows started by name: client helpers, `startWorkflow` and
  // `runToCompletion` calls, and each function's own `rpc.startWorkflow`.
  const startedWorkflows = new Set(state.workflows.invokedWorkflows)
  for (const meta of Object.values(state.functions.meta)) {
    for (const name of meta.startsWorkflows ?? []) startedWorkflows.add(name)
  }
  for (const workflowName of startedWorkflows) uses.add(workflowName)
  // A workflow named by its workflow name, by any of the above or by
  // `rpc.invoke` and step calls, uses the function behind it.
  for (const [workflowName, entry] of Object.entries(
    workflowsMeta as Record<string, { pikkuFuncId?: string }>
  )) {
    if (uses.has(workflowName) && entry?.pikkuFuncId)
      uses.add(entry.pikkuFuncId)
  }

  const unused: UnusedFunction[] = []
  for (const [pikkuFuncId, meta] of Object.entries(state.functions.meta)) {
    if (meta.functionType !== 'user') continue
    if (meta.funcWrapper && RUN_BY_SCENARIOS.has(meta.funcWrapper)) continue
    if (meta.expose || meta.remote || meta.mcp) continue
    // A generated scaffold is rewritten on every run, so `disabled` cannot be
    // added to it; what it leaves unwired it leaves for the project to wire.
    if (meta.sourceFile?.endsWith('.gen.ts')) continue
    if (uses.has(pikkuFuncId) || (meta.name && uses.has(meta.name))) continue
    unused.push({
      pikkuFuncId,
      ...(meta.name ? { name: meta.name } : {}),
      ...(meta.sourceFile ? { sourceFile: meta.sourceFile } : {}),
    })
  }
  return unused
}
