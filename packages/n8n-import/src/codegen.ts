import type {
  ParsedWorkflow,
  ParsedNode,
  ImportDiagnostic,
  WorkflowRefResolver,
} from './types.js'
import { buildTopology, type NextValue } from './topology.js'
import {
  classifyExpression,
  type ExprContext,
  type RefPart,
} from './expressions.js'
import { toPascalCase } from './naming.js'
import { normalizeBranch } from './branch.js'
import {
  nativeSpecFor,
  nativeOutputAliasFor,
  type NativeFieldSpec,
} from './native-map.js'
import {
  deriveCredentialInstances,
  nodeInstanceBindings,
  type CredentialInstance,
} from './credentials.js'
import { findAgentSubNode } from './ai-subnodes.js'
import { mapModel } from './model-map.js'
import { outputParserToZod } from './output-schema.js'

export interface ManifestEntry {
  rpcName: string
  n8nType: string
  n8nName: string
  parameters: Record<string, unknown>
  credentials?: Record<string, unknown>
  /** Addon instance name this node's credential binds to, when it has one. */
  credentialInstance?: string
  isAgentTool: boolean
  agentName?: string
}

export interface GenerateResult {
  /** path -> file content */
  files: Record<string, string>
  manifest: ManifestEntry[]
  /** Encapsulated addon instances (one per distinct n8n credential). */
  credentialInstances: CredentialInstance[]
  /**
   * Reasons the workflow could not be imported. When any has `type: 'error'`,
   * the workflow is skipped — `files` is empty and nothing should be written.
   */
  diagnostics: ImportDiagnostic[]
}

export interface GenerateOptions {
  /**
   * Resolve a sub-workflow's n8n id → the registered Pikku workflow name, built
   * from the whole import set. Absent (single-file import) ⇒ only self-recursion
   * resolves; every cross-workflow reference is reported as missing.
   */
  resolveWorkflowRef?: WorkflowRefResolver
  /**
   * Prefix applied to every generated *stub* rpc name (integration / agent-tool /
   * code / vector / unmapped-control). Stub functions are locally defined, so
   * importing several workflows into one project would otherwise collide on a
   * shared name (a `DUPLICATE_FUNCTION_NAME` critical). Addon rpcs (`graph:*`,
   * `service:*`), sub-workflow names, and agent names are shared and never
   * prefixed. No prefix ⇒ names are unchanged (single-file import).
   */
  rpcPrefix?: string
}

/** Roles whose rpc is a locally-generated stub function (not a shared addon/workflow rpc). */
const STUB_ROLES = new Set<ParsedNode['role']>([
  'integration',
  'agentTool',
  'code',
  'vectorStore',
  'control',
])

/**
 * Resolve every executeWorkflow / toolWorkflow node to the Pikku workflow name
 * it should call. Self-references resolve to the workflow's own name; static ids
 * go through the import-set resolver; anything unresolved (dangling id or
 * runtime-dynamic target) produces an error diagnostic that skips the workflow.
 */
function resolveSubworkflows(
  parsed: ParsedWorkflow,
  resolve?: WorkflowRefResolver
): { targets: Map<string, string>; diagnostics: ImportDiagnostic[] } {
  const targets = new Map<string, string>()
  const diagnostics: ImportDiagnostic[] = []
  for (const node of parsed.nodes) {
    if (node.disabled || !node.workflowRef) continue
    const refKind = node.workflowRef.kind
    if (refKind === 'self') {
      targets.set(node.nodeId, parsed.name)
    } else if (refKind === 'static') {
      const name = resolve?.(node.workflowRef.targetId!)
      if (name) targets.set(node.nodeId, name)
      else
        diagnostics.push({
          diagnostic: 'PIKKU_N8N_IMPORT_DIAGNOSTIC',
          type: 'error',
          reason: 'missing-subworkflow',
          message: `Node "${node.name}" references a subflow that doesn't exist (n8n id "${node.workflowRef.targetId}") — not part of the import.`,
          node: node.name,
        })
    } else {
      diagnostics.push({
        diagnostic: 'PIKKU_N8N_IMPORT_DIAGNOSTIC',
        type: 'error',
        reason: 'dynamic-subworkflow-target',
        message: `Node "${node.name}" selects its sub-workflow at runtime — the target can't be identified statically.`,
        node: node.name,
      })
    }
  }
  return { targets, diagnostics }
}

const q = (v: unknown) => JSON.stringify(v)

function safeJson(value: unknown): string | null {
  try {
    const out = JSON.stringify(value)
    return out === undefined ? null : out
  } catch {
    return null
  }
}

function emitRef(ref: RefPart): string {
  return ref.path
    ? `ref(${q(ref.nodeId)}, ${q(ref.path)})`
    : `ref(${q(ref.nodeId)})`
}

/** Render one classified parameter value as a graph-input expression. */
function emitValue(value: unknown, ctx: ExprContext): string | null {
  const classified = classifyExpression(value, ctx)
  if (classified.kind === 'literal') {
    return safeJson(classified.value)
  }
  if (classified.kind === 'ref') {
    return emitRef(classified)
  }
  if (classified.kind === 'template') {
    const tmpl = classified.parts
      .map((p, i) => p + (i < classified.refs.length ? `$${i}` : ''))
      .join('')
    return `template(${q(tmpl)}, [${classified.refs
      .map((r) => emitRef(r))
      .join(', ')}])`
  }
  return null
}

/** Top-level Set/Edit-Fields parameters that are node config, never fields. */
const SET_CONFIG_KEYS = new Set([
  'mode',
  'options',
  'assignments',
  'values',
  'include',
  'includeOtherFields',
  'keepOnlySet',
  'duplicateItem',
])

/**
 * Extract a Set / Edit Fields node's assignments as a flat `{ field, value }`
 * list, normalizing across the node's format versions:
 *  - v3.4 "Edit Fields (Set)": `parameters.assignments.assignments[]` ({ name, value })
 *  - v2 "Set": `parameters.values.{string,number,boolean,…}[]` ({ name, value })
 *  - simplified/flat: each remaining top-level parameter key is a field
 */
function setAssignments(
  parameters: Record<string, unknown>
): { field: string; value: unknown }[] {
  const container = parameters.assignments as
    | { assignments?: unknown }
    | undefined
  if (container && Array.isArray(container.assignments)) {
    return container.assignments
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => ({ field: String(a.name ?? ''), value: a.value }))
      .filter((a) => a.field)
  }

  const values = parameters.values
  if (values && typeof values === 'object') {
    const out: { field: string; value: unknown }[] = []
    for (const group of Object.values(values as Record<string, unknown>)) {
      if (!Array.isArray(group)) continue
      for (const entry of group) {
        if (entry && typeof entry === 'object' && 'name' in entry) {
          const e = entry as Record<string, unknown>
          out.push({ field: String(e.name ?? ''), value: e.value })
        }
      }
    }
    if (out.length > 0) return out.filter((a) => a.field)
  }

  return Object.entries(parameters)
    .filter(([key]) => !SET_CONFIG_KEYS.has(key))
    .map(([field, value]) => ({ field, value }))
}

/**
 * Build the `input: (ref) => ({...})` body for an n8n Set / Edit Fields node,
 * lowering each assignment to a `set` operation for `@pikku/addon-graph`'s
 * `editFields` function.
 */
function emitSetInput(node: ParsedNode, ctx: ExprContext): string | null {
  const ops: string[] = []
  for (const { field, value } of setAssignments(node.parameters)) {
    const classified = classifyExpression(value, ctx)
    if (classified.kind === 'transform') {
      // Both the field name and value may be multi-line n8n expressions (a Set
      // assignment can compute its own key via an IIFE); flatten each to a single
      // line so it stays inside the `//` comment instead of leaking live code.
      const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()
      ops.push(
        `        // TODO(n8n expr): ${oneLine(field)} = ${oneLine(classified.expression)}`
      )
      continue
    }
    const rendered = emitValue(value, ctx)
    if (rendered === null) continue
    ops.push(
      `        { field: ${q(field)}, operation: "set" as const, value: ${rendered} },`
    )
  }
  if (ops.length === 0) return null
  return [
    `(ref) => ({`,
    `      item: {},`,
    `      operations: [`,
    ...ops,
    `      ],`,
    `    })`,
  ].join('\n')
}

/** Render an n8n keypair collection (`[{ name, value }]`) as an object literal. */
function emitParamObject(params: unknown, ctx: ExprContext): string | null {
  if (!Array.isArray(params)) return null
  const entries: string[] = []
  for (const p of params) {
    if (!p || typeof p !== 'object') continue
    const name = String((p as Record<string, unknown>).name ?? '')
    if (!name) continue
    const rendered = emitValue((p as Record<string, unknown>).value, ctx)
    if (rendered === null) continue
    entries.push(`${q(name)}: ${rendered}`)
  }
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : null
}

/**
 * Build the `input: (ref) => ({...})` body for an n8n HTTP Request node,
 * mapping its parameters onto @pikku/addon-graph's `httpRequest` contract
 * (`{ method, url, headers, query, body }`).
 */
function emitHttpInput(node: ParsedNode, ctx: ExprContext): string | null {
  const p = node.parameters
  const lines: string[] = []

  const method = emitValue(p.method ?? 'GET', ctx)
  // A literal method must keep its enum literal type, not widen to `string`.
  if (method !== null) {
    const rendered = /^".*"$/.test(method) ? `${method} as const` : method
    lines.push(`      method: ${rendered},`)
  }

  const url = emitValue(p.url, ctx)
  if (url !== null) lines.push(`      url: ${url},`)

  const headers = emitParamObject(
    (p.headerParameters as Record<string, unknown> | undefined)?.parameters,
    ctx
  )
  if (headers) lines.push(`      headers: ${headers},`)

  const query = emitParamObject(
    (p.queryParameters as Record<string, unknown> | undefined)?.parameters,
    ctx
  )
  if (query) lines.push(`      query: ${query},`)

  const bodyParams = (p.bodyParameters as Record<string, unknown> | undefined)
    ?.parameters
  if (Array.isArray(bodyParams)) {
    const body = emitParamObject(bodyParams, ctx)
    if (body) lines.push(`      body: ${body},`)
  } else if (p.jsonBody !== undefined) {
    const body = emitValue(p.jsonBody, ctx)
    if (body !== null) lines.push(`      body: ${body},`)
  }

  if (lines.length === 0) return null
  return [`(ref) => ({`, ...lines, `    })`].join('\n')
}

/**
 * Build the `input: (ref) => ({...})` body for an n8n IF / Filter / Switch node,
 * mapping its conditions onto @pikku/addon-graph's `branch` contract
 * (`{ cases: [{ key, combinator, conditions }], fallback }`). Each operand is
 * lowered like any other value — a ref, a template, or a literal.
 */
function emitBranchInput(node: ParsedNode, ctx: ExprContext): string | null {
  const spec = normalizeBranch(node)
  if (!spec) return null

  const caseLines = spec.cases.map((c) => {
    const conds = c.conditions.map((cond) => {
      const left = emitValue(cond.left, ctx) ?? 'undefined'
      const parts = [`left: ${left}`]
      if (cond.right !== undefined) {
        const right = emitValue(cond.right, ctx)
        if (right !== null) parts.push(`right: ${right}`)
      }
      parts.push(
        `type: ${q(cond.type)} as const`,
        `operation: ${q(cond.operation)}`
      )
      return `{ ${parts.join(', ')} }`
    })
    return `        { key: ${q(c.key)}, combinator: ${q(c.combinator)} as const, conditions: [${conds.join(', ')}] },`
  })

  const lines = [`(ref) => ({`, `      cases: [`, ...caseLines, `      ],`]
  if (spec.fallback) lines.push(`      fallback: ${q(spec.fallback)},`)
  lines.push(`    })`)
  return lines.join('\n')
}

/**
 * Build the `input: (ref) => ({...})` body for a native addon node, sourcing
 * each addon input field from an n8n parameter per its `native-map` spec.
 */
/** Read a dot-path (`a.b.c`) out of a nested n8n parameter object. */
function readPath(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

type CollectionSpec = NonNullable<NativeFieldSpec['fromCollection']>

/**
 * Render an n8n `fixedCollection` row array as a graph-input value: an array of
 * projected objects (`map`), or an array / single scalar (`pick` / `pick+first`).
 * Each source value is lowered like any other expression (ref / template /
 * literal), with optional per-key enum remapping. Returns null when empty.
 */
function emitCollection(
  spec: CollectionSpec,
  parameters: Record<string, unknown>,
  ctx: ExprContext
): string | null {
  const rows = readPath(parameters, spec.path)
  if (!Array.isArray(rows) || rows.length === 0) return null

  if (spec.pick) {
    const picked = rows
      .map((r) => (r as Record<string, unknown>)?.[spec.pick!])
      .filter((v) => v !== undefined && v !== '')
    if (spec.first) {
      if (picked.length === 0) return null
      return emitValue(picked[0], ctx)
    }
    const vals = picked.map((v) => emitValue(v, ctx)).filter((v) => v !== null)
    return vals.length ? `[${vals.join(', ')}]` : null
  }

  if (spec.map) {
    const objs: string[] = []
    for (const row of rows) {
      const r = row as Record<string, unknown>
      const parts: string[] = []
      for (const [outKey, src] of Object.entries(spec.map)) {
        const fromKey = typeof src === 'string' ? src : src.from
        let raw = r?.[fromKey]
        if (raw === undefined) continue
        if (typeof src !== 'string' && src.values && typeof raw === 'string') {
          raw = src.values[raw] ?? raw
        }
        const rendered = emitValue(raw, ctx)
        if (rendered === null) continue
        parts.push(`${outKey}: ${rendered}`)
      }
      if (parts.length) objs.push(`{ ${parts.join(', ')} }`)
    }
    return objs.length ? `[${objs.join(', ')}]` : null
  }

  return null
}

function emitNativeInput(node: ParsedNode, ctx: ExprContext): string | null {
  const spec = nativeSpecFor(node.typeShort, node.parameters)
  if (!spec) return null
  const lines: string[] = []
  for (const [field, fspec] of Object.entries(spec.fields)) {
    if (fspec.fromPredecessor) {
      // n8n's implicit incoming item stream → the data predecessor's whole
      // output (a pathless ref). No predecessor ⇒ nothing to feed.
      if (!ctx.predecessorNodeId) continue
      lines.push(`      ${field}: ref(${q(ctx.predecessorNodeId)}),`)
      continue
    }
    if (fspec.fromAllPredecessors) {
      const preds = ctx.predecessorNodeIds ?? []
      if (preds.length === 0) continue
      const refs = preds.map((p) => `ref(${q(p)})`).join(', ')
      lines.push(`      ${field}: [${refs}],`)
      continue
    }
    if (fspec.fromPredecessorPath) {
      // n8n's `dataPropertyName` reads a field off the incoming item; when the
      // data predecessor is the trigger it's excluded from the graph, so fall
      // back to the implicit 'trigger' input (same id expression lowering uses).
      const predId = ctx.predecessorNodeId ?? 'trigger'
      const rawName = node.parameters[fspec.fromPredecessorPath.param]
      const path =
        typeof rawName === 'string' && /^[A-Za-z0-9_.]+$/.test(rawName)
          ? rawName
          : fspec.fromPredecessorPath.default
      lines.push(`      ${field}: ref(${q(predId)}, ${q(path)}),`)
      continue
    }
    if (fspec.fromNodeId) {
      lines.push(`      ${field}: ${q(node.nodeId)},`)
      continue
    }
    if (fspec.fromCollection) {
      const rendered = emitCollection(
        fspec.fromCollection,
        node.parameters,
        ctx
      )
      if (rendered === null) continue
      lines.push(`      ${field}: ${rendered},`)
      continue
    }
    if (fspec.fromRL) {
      const rlKeys = Array.isArray(fspec.fromRL) ? fspec.fromRL : [fspec.fromRL]
      let rlValue: unknown
      for (const key of rlKeys) {
        const loc = node.parameters[key]
        if (loc && typeof loc === 'object' && '__rl' in (loc as object)) {
          rlValue = (loc as { value?: unknown }).value
          break
        }
        if (loc !== undefined) {
          rlValue = loc
          break
        }
      }
      if (rlValue === undefined) rlValue = fspec.default
      if (rlValue === undefined) continue
      if (fspec.values && typeof rlValue === 'string')
        rlValue = fspec.values[rlValue] ?? rlValue
      let rendered = emitValue(rlValue, ctx)
      if (rendered === null) continue
      if (fspec.asConst && /^".*"$/.test(rendered))
        rendered = `${rendered} as const`
      lines.push(`      ${field}: ${rendered},`)
      continue
    }
    const froms = fspec.from
      ? Array.isArray(fspec.from)
        ? fspec.from
        : [fspec.from]
      : []
    let raw: unknown
    for (const key of froms) {
      if (node.parameters[key] !== undefined) {
        raw = node.parameters[key]
        break
      }
    }
    if (raw === undefined) raw = fspec.default
    if (raw === undefined) continue
    if (fspec.values && typeof raw === 'string') raw = fspec.values[raw] ?? raw
    let rendered = emitValue(raw, ctx)
    if (rendered === null) continue
    if (fspec.asConst && /^".*"$/.test(rendered))
      rendered = `${rendered} as const`
    lines.push(`      ${field}: ${rendered},`)
  }
  if (lines.length === 0) return null
  return [`(ref) => ({`, ...lines, `    })`].join('\n')
}

/** Build the `input: (ref) => ({...})` body for a node from its parameters. */
function emitInput(node: ParsedNode, ctx: ExprContext): string | null {
  if (node.role === 'set') return emitSetInput(node, ctx)
  if (node.role === 'http') return emitHttpInput(node, ctx)
  if (node.role === 'branch') return emitBranchInput(node, ctx)
  if (node.role === 'native') return emitNativeInput(node, ctx)
  const lines: string[] = []
  for (const [key, value] of Object.entries(node.parameters)) {
    const classified = classifyExpression(value, ctx)
    const rendered = emitValue(value, ctx)
    if (rendered !== null) {
      lines.push(`      ${q(key)}: ${rendered},`)
    } else if (classified.kind === 'transform') {
      // Tier 3 — not declaratively expressible; preserve verbatim as a TODO.
      lines.push(
        `      // TODO(n8n expr): ${key} = ${classified.expression.replace(/\n/g, ' ')}`
      )
    }
  }
  if (lines.length === 0) return null
  return [`(ref) => ({`, ...lines, `    })`].join('\n')
}

function emitNext(next: NextValue): string {
  if (typeof next === 'string') return q(next)
  if (Array.isArray(next)) return `[${next.map(q).join(', ')}]`
  // Key-based branch next (`graph.branch(key)` routing). The graph's `NextConfig`
  // can't narrow the record's string-array targets to node-id literals, so — as
  // the hand-authored graphs do — cast it. See e2e graph-branching.workflow.ts.
  const entries = Object.entries(next)
    .map(([k, v]) => `${q(k)}: [${v.map(q).join(', ')}]`)
    .join(', ')
  return `{ ${entries} } as any`
}

function emitGraphFile(
  parsed: ParsedWorkflow,
  targets: Map<string, string>
): string {
  const topo = buildTopology(parsed)
  const constName = `${parsed.slug}Workflow`

  const nodesLines = topo.graphNodes.map((n) => {
    // An embedded agent is a native graph node (#910), referenced by its
    // registered agent name — the exported const (`<slug>Agent`), which is the
    // AgentMap key — not a stub rpc. A sub-workflow (executeWorkflow) node
    // references the target workflow by its registered name (self-recursion →
    // this workflow's own name).
    const value =
      n.role === 'agent'
        ? `${parsed.slug}Agent`
        : n.role === 'subworkflow'
          ? targets.get(n.nodeId)!
          : n.rpcName
    return `    ${n.nodeId}: ${q(value)},`
  })

  const triggerNodeIds = new Set(
    parsed.nodes.filter((n) => n.role === 'trigger').map((n) => n.nodeId)
  )

  // native nodes whose result is written under a named output field → a
  // per-node map from that n8n field name to the addon output key.
  const outputAliasByNodeId: Record<string, Record<string, string>> = {}
  for (const node of topo.graphNodes) {
    if (node.role !== 'native') continue
    const alias = nativeOutputAliasFor(node.typeShort, node.parameters)
    if (alias) outputAliasByNodeId[node.nodeId] = { [alias.field]: alias.to }
  }

  let anyTemplate = false
  const configBlocks: string[] = []
  for (const node of topo.graphNodes) {
    const t = topo.byNodeId[node.nodeId]!
    const ctx: ExprContext = {
      predecessorNodeId: t.predecessorNodeId,
      predecessorNodeIds: t.predecessorNodeIds,
      nameToNodeId: topo.nameToNodeId,
      triggerNodeIds,
      refRewrite: topo.refRewrite,
      outputAliasByNodeId,
    }
    const wantsInput =
      node.role === 'integration' ||
      node.role === 'set' ||
      node.role === 'http' ||
      node.role === 'branch' ||
      node.role === 'native'

    const parts: string[] = []
    const input = wantsInput ? emitInput(node, ctx) : null
    if (input) {
      parts.push(`      input: ${input},`)
      if (input.includes('template(')) anyTemplate = true
    }
    if (t.next !== undefined) parts.push(`      next: ${emitNext(t.next)},`)
    if (t.onError !== undefined)
      parts.push(`      onError: ${emitNext(t.onError as NextValue)},`)
    if (node.notes) parts.push(`      notes: ${q(node.notes)},`)
    if (parts.length > 0) {
      configBlocks.push(`    ${node.nodeId}: {\n${parts.join('\n')}\n    },`)
    }
  }

  const imports = [
    `import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'`,
  ]
  if (anyTemplate)
    imports.push(`import { template } from '@pikku/core/workflow'`)

  const notesLine =
    parsed.stickyNotes.length > 0
      ? `  notes: [${parsed.stickyNotes.map(q).join(', ')}],\n`
      : ''

  return [
    imports.join('\n'),
    ``,
    `export const ${constName} = pikkuWorkflowGraph({`,
    `  name: ${q(parsed.name)},`,
    notesLine + `  nodes: {\n${nodesLines.join('\n')}\n  },`,
    configBlocks.length > 0
      ? `  config: {\n${configBlocks.join('\n')}\n  },`
      : `  config: {},`,
    `})`,
    ``,
  ].join('\n')
}

function envelopeSchemas(inputName: string, outputName: string): string {
  // Stub bodies are unimplemented, so their I/O shapes are unknown. Keep the
  // schemas fully permissive: the workflow graph type-checks every node's
  // `input` mapping against the target's input schema and every `ref(...)` path
  // against a node's output schema — an opaque stub must accept any mapping and
  // expose any ref path, or a valid import won't type-check.
  return [
    `export const ${inputName} = z.any()`,
    `export const ${outputName} = z.any()`,
  ].join('\n')
}

function emitIntegrationStub(node: ParsedNode): string {
  const Pascal = toPascalCase(node.rpcName)
  const inputName = `${Pascal}Input`
  const outputName = `${Pascal}Output`
  return [
    `import { z } from 'zod'`,
    `import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'`,
    ``,
    envelopeSchemas(inputName, outputName),
    ``,
    `/** STUB — generated from n8n node ${q(node.name)} (type ${q(node.type)}). */`,
    `export const ${node.rpcName} = pikkuSessionlessFunc({`,
    `  input: ${inputName},`,
    `  output: ${outputName},`,
    `  func: async () => {`,
    `    throw new Error(${q(`${node.rpcName} — implement me`)})`,
    `  },`,
    `})`,
    ``,
  ].join('\n')
}

function emitCodeStub(node: ParsedNode): string {
  const Pascal = toPascalCase(node.rpcName)
  const inputName = `${Pascal}Input`
  const outputName = `${Pascal}Output`
  const code =
    (node.parameters.jsCode as string | undefined) ??
    (node.parameters.functionCode as string | undefined) ??
    ''
  const preserved = code
    .replace(/\*\//g, '*\\/')
    .split('\n')
    .map((l) => ` *   ${l}`)
    .join('\n')
  return [
    `import { z } from 'zod'`,
    `import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'`,
    ``,
    envelopeSchemas(inputName, outputName),
    ``,
    `/**`,
    ` * STUB — generated from n8n Code node ${q(node.name)}.`,
    ` *`,
    ` * Original n8n JavaScript (preserved verbatim; rewrite for Pikku semantics):`,
    ` *`,
    preserved || ` *   (empty)`,
    ` */`,
    `export const ${node.rpcName} = pikkuSessionlessFunc({`,
    `  description: ${q(`Stub: ported from n8n Code node "${node.name}"`)},`,
    `  input: ${inputName},`,
    `  output: ${outputName},`,
    `  func: async () => {`,
    `    throw new Error(${q(`Stub: ported from n8n Code node "${node.name}" — implement me`)})`,
    `  },`,
    `})`,
    ``,
  ].join('\n')
}

function emitVectorStub(node: ParsedNode): string {
  const Pascal = toPascalCase(node.rpcName)
  const inputName = `${Pascal}Input`
  const outputName = `${Pascal}Output`
  const index = (node.parameters.indexName ??
    node.parameters.pineconeIndex ??
    node.parameters.tableName ??
    'my-collection') as string
  return [
    `import { z } from 'zod'`,
    `import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'`,
    ``,
    `export const ${inputName} = z.object({`,
    `  query: z.string(),`,
    `  topK: z.number().optional(),`,
    `})`,
    `export const ${outputName} = z.object({`,
    `  matches: z.array(z.object({ id: z.string(), score: z.number() })),`,
    `})`,
    ``,
    `/**`,
    ` * STUB — generated from n8n vector-store node ${q(node.name)} (type ${q(node.type)}).`,
    ` *`,
    ` * RAG has no core Pikku primitive yet — tracked in pikkujs/pikku#902. Once`,
    ` * @pikku VectorStore lands, replace this body with:`,
    ` *   const matches = await services.vectorStore.query(${q(index)}, data.query, { topK: data.topK ?? 5 })`,
    ` *   return { matches }`,
    ` */`,
    `export const ${node.rpcName} = pikkuSessionlessFunc({`,
    `  input: ${inputName},`,
    `  output: ${outputName},`,
    `  func: async () => {`,
    `    throw new Error(${q(`${node.rpcName} — RAG not yet supported (pikkujs/pikku#902); implement me`)})`,
    `  },`,
    `})`,
    ``,
  ].join('\n')
}

/**
 * n8n memory sub-node → Pikku agent `memory` config. `memoryBufferWindow` maps
 * cleanly to `lastMessages` (n8n's default window is 5); other backends
 * (postgres/redis chat) need a service and are left as a TODO for the operator.
 */
function emitMemory(node: ParsedNode): string {
  if (node.typeShort === 'memoryBufferWindow') {
    const raw = node.parameters.contextWindowLength
    const n = typeof raw === 'number' ? raw : 5
    return `  memory: { lastMessages: ${n} },`
  }
  return `  // TODO(n8n): map memory node ${q(node.name)} (${q(node.type)}) to a Pikku memory backend`
}

/**
 * Resolve the structured-output parser feeding an agent. n8n may wrap it in an
 * `outputParserAutofixing` node (the structured parser hangs off *that* node's
 * `ai_outputParser` port), so unwrap one level when the direct parser carries no
 * schema of its own.
 */
function resolveOutputSchema(
  parsed: ParsedWorkflow,
  agentName: string
): string | undefined {
  const parser = findAgentSubNode(parsed, agentName, 'ai_outputParser')
  if (!parser) return undefined
  const direct = outputParserToZod(parser)
  if (direct) return direct
  const inner = findAgentSubNode(parsed, parser.name, 'ai_outputParser')
  return inner ? outputParserToZod(inner) : undefined
}

function emitAgentFile(
  parsed: ParsedWorkflow,
  targets: Map<string, string>
): string {
  const agent = parsed.agentNode!
  const tools = parsed.nodes.filter((n) => n.role === 'agentTool')
  const systemPrompt =
    (agent.parameters.text as string | undefined) ??
    (agent.parameters.systemMessage as string | undefined) ??
    ((agent.parameters.options as Record<string, unknown> | undefined)
      ?.systemMessage as string | undefined) ??
    `You are ${parsed.name}.`

  const modelNode = findAgentSubNode(parsed, agent.name, 'ai_languageModel')
  const model = modelNode ? mapModel(modelNode) : undefined
  const memoryNode = findAgentSubNode(parsed, agent.name, 'ai_memory')
  const outputZod = resolveOutputSchema(parsed, agent.name)

  // A toolWorkflow tool references the target workflow by its registered name
  // (self-recursion → this workflow's own name); other tools ref their stub rpc.
  const toolLines = tools.map(
    (t) => `    ref(${q(t.workflowRef ? targets.get(t.nodeId)! : t.rpcName)}),`
  )

  const imports = [
    `import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'`,
    `import { ref } from '#pikku/pikku-types.gen.js'`,
  ]
  if (outputZod) imports.push(`import { z } from 'zod'`)

  const modelLines = model
    ? [`  model: '${model.model}',`]
    : [
        `  // TODO(n8n): map the connected chat-model node to a Pikku model id`,
        `  model: 'openai/gpt-4o',`,
      ]
  if (model?.temperature !== undefined)
    modelLines.push(`  temperature: ${model.temperature},`)

  // An agent `output` must reference an exported schema variable — inline
  // schemas are rejected (PKU489). Emit the Zod as a top-level const.
  const outputConst = outputZod
    ? `${toPascalCase(parsed.slug)}Output`
    : undefined

  return [
    imports.join('\n'),
    ``,
    ...(outputZod ? [`export const ${outputConst} = ${outputZod}`, ``] : []),
    `export const ${parsed.slug}Agent = pikkuAIAgent({`,
    `  name: ${q(parsed.slug)},`,
    `  description: ${q(parsed.name)},`,
    `  goal: ${q(systemPrompt)},`,
    ...modelLines,
    ...(memoryNode ? [emitMemory(memoryNode)] : []),
    tools.length > 0
      ? `  tools: [\n${toolLines.join('\n')}\n  ],`
      : `  tools: [],`,
    ...(outputConst ? [`  output: ${outputConst},`] : []),
    `})`,
    ``,
  ].join('\n')
}

/**
 * Emit `wireAddon(...)` declarations — one encapsulated addon instance per
 * distinct n8n credential, each bound to its own credential via
 * `credentialOverrides`. Packages are inferred from the n8n credential type and
 * refined downstream by the addon-map step.
 */
/** `google-drive:filesGet` → { namespace: 'google-drive', fn: 'filesGet' }. */
function splitAddonRpc(
  rpc: string
): { namespace: string; fn: string } | undefined {
  const i = rpc.indexOf(':')
  if (i < 0) return undefined
  const namespace = rpc.slice(0, i)
  if (namespace === 'graph') return undefined
  return { namespace, fn: rpc.slice(i + 1) }
}

/**
 * Distinct per-service addon namespaces referenced by mapped native nodes
 * (`google-drive:filesGet` → `google-drive` / `@pikku/addon-google-drive`).
 * These must be `wireAddon`'d so the graph's function-map union includes their
 * rpcs — otherwise the addon-ref graph nodes don't type-check.
 */
function mappedAddonPackages(
  parsed: ParsedWorkflow
): { namespace: string; package: string }[] {
  const byNs = new Map<string, { namespace: string; package: string }>()
  for (const node of parsed.nodes) {
    if (node.disabled || node.role !== 'native') continue
    const split = splitAddonRpc(node.rpcName)
    if (!split || byNs.has(split.namespace)) continue
    byNs.set(split.namespace, {
      namespace: split.namespace,
      package: `@pikku/addon-${split.namespace}`,
    })
  }
  return [...byNs.values()]
}

function emitAddonsFile(
  instances: CredentialInstance[],
  mappedAddons: { namespace: string; package: string }[]
): string {
  // A mapped service is wired plainly by its `mappedBlocks` entry and the graph
  // references its single namespace (`slack:chatPostMessage`). The forward-looking
  // per-credential override blocks for that same package are then orphaned — no
  // graph node calls them and they target credentials that don't exist yet, which
  // fails inspection (PKU124). Multi-account per-credential namespacing isn't built
  // yet, so drop them for mapped packages (the manifest still records each node's
  // credential for the addon-map step).
  const mappedPackages = new Set(mappedAddons.map((a) => a.package))
  const keptInstances = instances.filter(
    (inst) => !mappedPackages.has(inst.package)
  )
  const credBlocks = keptInstances.map((inst) =>
    [
      `wireAddon({`,
      `  name: ${q(inst.instanceName)},`,
      `  package: ${q(inst.package)},`,
      `  credentialOverrides: { ${q(inst.addonCredKey)}: ${q(inst.credentialName)} },`,
      `})`,
    ].join('\n')
  )
  // Addon instances for mapped nodes whose namespace isn't already provisioned
  // by a credential instance. Credential binding is filled in by the addon-map
  // step; here we just register the package so its rpcs resolve.
  const provisioned = new Set(keptInstances.map((i) => i.instanceName))
  const mappedBlocks = mappedAddons
    .filter((a) => !provisioned.has(a.namespace))
    .map((a) =>
      [
        `wireAddon({`,
        `  name: ${q(a.namespace)},`,
        `  package: ${q(a.package)},`,
        `})`,
      ].join('\n')
    )
  return [
    `import { wireAddon } from '@pikku/core/rpc'`,
    ``,
    `// TODO(n8n): verify each addon package + credential key — packages are`,
    `// inferred from the n8n credential type and refined by the addon-map step.`,
    ...[...credBlocks, ...mappedBlocks].flatMap((b) => [``, b]),
    ``,
  ].join('\n')
}

/**
 * Generate Pikku source from a parsed n8n workflow. Pure — returns a path→content
 * map plus the integration manifest. No filesystem access.
 */
export function generateWorkflowFromN8n(
  parsed: ParsedWorkflow,
  opts: GenerateOptions = {}
): GenerateResult {
  // Resolve sub-workflow references first: an unresolved one (dangling id or
  // runtime-dynamic target) makes the whole workflow un-importable — emit the
  // diagnostic and skip rather than write a graph that can never run.
  const { targets, diagnostics } = resolveSubworkflows(
    parsed,
    opts.resolveWorkflowRef
  )
  if (diagnostics.some((d) => d.type === 'error')) {
    return { files: {}, manifest: [], credentialInstances: [], diagnostics }
  }

  // Namespace locally-generated stub rpcs so several workflows can share one
  // project without colliding. A stub whose target is a sub-workflow keeps the
  // resolved workflow name (no stub is emitted for it).
  if (opts.rpcPrefix) {
    for (const node of parsed.nodes) {
      if (!node.workflowRef && STUB_ROLES.has(node.role)) {
        node.rpcName = `${opts.rpcPrefix}${node.rpcName}`
      }
    }
  }

  const files: Record<string, string> = {}
  const dir = parsed.slug
  const credentialInstances = deriveCredentialInstances(parsed)
  const bindings = nodeInstanceBindings(credentialInstances)

  const emitGraph = parsed.shape !== 'agent-only'
  if (emitGraph) {
    files[`${dir}/${parsed.slug}.graph.ts`] = emitGraphFile(parsed, targets)
  }
  if (parsed.agentNode) {
    files[`${dir}/${parsed.slug}.agent.ts`] = emitAgentFile(parsed, targets)
  }

  const emittedStubRpc = new Set<string>()
  for (const node of parsed.nodes) {
    if (node.disabled) continue
    // Sub-workflow references (executeWorkflow / toolWorkflow) resolve to a
    // workflow name — no stub function.
    if (node.workflowRef) continue
    // Set / Edit Fields, no-auth HTTP, IF/Filter/Switch, and other native nodes
    // map to @pikku/addon-graph functions (`editFields` / `httpRequest` /
    // `branch` / …) — no stub.
    if (
      node.role === 'set' ||
      node.role === 'http' ||
      node.role === 'branch' ||
      node.role === 'native'
    )
      continue
    if (emittedStubRpc.has(node.rpcName)) continue
    if (
      node.role === 'integration' ||
      node.role === 'agentTool' ||
      node.role === 'control'
    ) {
      files[`${dir}/functions/${node.rpcName}.function.ts`] =
        emitIntegrationStub(node)
      emittedStubRpc.add(node.rpcName)
    } else if (node.role === 'code') {
      files[`${dir}/functions/${node.rpcName}.function.ts`] = emitCodeStub(node)
      emittedStubRpc.add(node.rpcName)
    } else if (node.role === 'vectorStore') {
      files[`${dir}/functions/${node.rpcName}.function.ts`] =
        emitVectorStub(node)
      emittedStubRpc.add(node.rpcName)
    }
  }
  const mappedAddons = mappedAddonPackages(parsed)
  if (credentialInstances.length > 0 || mappedAddons.length > 0) {
    files[`${dir}/${parsed.slug}.addons.gen.ts`] = emitAddonsFile(
      credentialInstances,
      mappedAddons
    )
  }

  // Manifest: one entry per integration / agent-tool node.
  const agentName = parsed.slug
  const manifest: ManifestEntry[] = parsed.nodes
    .filter(
      (n) =>
        !n.workflowRef && (n.role === 'integration' || n.role === 'agentTool')
    )
    .map((n) => ({
      rpcName: n.rpcName,
      n8nType: n.type,
      n8nName: n.name,
      parameters: n.parameters,
      credentials: n.credentials,
      credentialInstance: bindings[n.rpcName],
      isAgentTool: n.role === 'agentTool',
      agentName: n.role === 'agentTool' ? agentName : undefined,
    }))

  if (manifest.length > 0) {
    files[`${dir}/${parsed.slug}.integrations.json`] = JSON.stringify(
      manifest,
      null,
      2
    )
  }

  return { files, manifest, credentialInstances, diagnostics }
}
