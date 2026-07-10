import type { ParsedWorkflow, ParsedNode } from './types.js'
import { buildTopology, type NextValue } from './topology.js'
import {
  classifyExpression,
  type ExprContext,
  type RefPart,
} from './expressions.js'
import { toPascalCase } from './naming.js'
import {
  deriveCredentialInstances,
  nodeInstanceBindings,
  type CredentialInstance,
} from './credentials.js'

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

function emitRef(ref: RefPart, setNodeIds: Set<string>): string {
  // @pikku/addon-graph's `editFields` wraps its result in `{ item }`, so a
  // reference into a Set node's output is prefixed with `item.`.
  const path = setNodeIds.has(ref.nodeId)
    ? ref.path
      ? `item.${ref.path}`
      : 'item'
    : ref.path
  return path ? `ref(${q(ref.nodeId)}, ${q(path)})` : `ref(${q(ref.nodeId)})`
}

/** Render one classified parameter value as a graph-input expression. */
function emitValue(
  value: unknown,
  ctx: ExprContext,
  setNodeIds: Set<string>
): string | null {
  const classified = classifyExpression(value, ctx)
  if (classified.kind === 'literal') {
    return safeJson(classified.value)
  }
  if (classified.kind === 'ref') {
    return emitRef(classified, setNodeIds)
  }
  if (classified.kind === 'template') {
    const tmpl = classified.parts
      .map((p, i) => p + (i < classified.refs.length ? `$${i}` : ''))
      .join('')
    return `template(${q(tmpl)}, [${classified.refs
      .map((r) => emitRef(r, setNodeIds))
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
function emitSetInput(
  node: ParsedNode,
  ctx: ExprContext,
  setNodeIds: Set<string>
): string | null {
  const ops: string[] = []
  for (const { field, value } of setAssignments(node.parameters)) {
    const classified = classifyExpression(value, ctx)
    if (classified.kind === 'transform') {
      ops.push(
        `        // TODO(n8n expr): ${field} = ${classified.expression.replace(/\n/g, ' ')}`
      )
      continue
    }
    const rendered = emitValue(value, ctx, setNodeIds)
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

/** Build the `input: (ref) => ({...})` body for a node from its parameters. */
function emitInput(
  node: ParsedNode,
  ctx: ExprContext,
  setNodeIds: Set<string>
): string | null {
  if (node.role === 'set') return emitSetInput(node, ctx, setNodeIds)
  const lines: string[] = []
  for (const [key, value] of Object.entries(node.parameters)) {
    const classified = classifyExpression(value, ctx)
    const rendered = emitValue(value, ctx, setNodeIds)
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
  const entries = Object.entries(next)
    .map(([k, v]) => `${q(k)}: [${v.map(q).join(', ')}]`)
    .join(', ')
  return `{ ${entries} }`
}

function usesTemplate(node: ParsedNode, ctx: ExprContext): boolean {
  return Object.values(node.parameters).some(
    (v) => classifyExpression(v, ctx).kind === 'template'
  )
}

function emitGraphFile(parsed: ParsedWorkflow): string {
  const topo = buildTopology(parsed)
  const constName = `${parsed.slug}Workflow`

  const setNodeIds = new Set(
    topo.graphNodes.filter((n) => n.role === 'set').map((n) => n.nodeId)
  )

  const nodesLines = topo.graphNodes.map(
    // An embedded agent is a native graph node (#910), referenced by its
    // registered agent name — the exported const (`<slug>Agent`), which is the
    // AgentMap key — not a stub rpc.
    (n) =>
      `    ${n.nodeId}: ${q(n.role === 'agent' ? `${parsed.slug}Agent` : n.rpcName)},`
  )

  let anyTemplate = false
  const configBlocks: string[] = []
  for (const node of topo.graphNodes) {
    const t = topo.byNodeId[node.nodeId]!
    const ctx: ExprContext = {
      predecessorNodeId: t.predecessorNodeId,
      nameToNodeId: topo.nameToNodeId,
    }
    const wantsInput = node.role === 'integration' || node.role === 'set'
    if (wantsInput && usesTemplate(node, ctx)) anyTemplate = true

    const parts: string[] = []
    const input = wantsInput ? emitInput(node, ctx, setNodeIds) : null
    if (input) parts.push(`      input: ${input},`)
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

function emitAgentFile(parsed: ParsedWorkflow): string {
  const agent = parsed.agentNode!
  const tools = parsed.nodes.filter((n) => n.role === 'agentTool')
  const systemPrompt =
    (agent.parameters.text as string | undefined) ??
    (agent.parameters.systemMessage as string | undefined) ??
    ((agent.parameters.options as Record<string, unknown> | undefined)
      ?.systemMessage as string | undefined) ??
    `You are ${parsed.name}.`

  const toolLines = tools.map((t) => `    ref(${q(t.rpcName)}),`)
  return [
    `import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'`,
    `import { ref } from '#pikku/pikku-types.gen.js'`,
    ``,
    `export const ${parsed.slug}Agent = pikkuAIAgent({`,
    `  name: ${q(parsed.slug)},`,
    `  description: ${q(parsed.name)},`,
    `  goal: ${q(systemPrompt)},`,
    `  // TODO(n8n): map the connected chat-model node to a Pikku model id`,
    `  model: 'openai/gpt-4o',`,
    tools.length > 0
      ? `  tools: [\n${toolLines.join('\n')}\n  ],`
      : `  tools: [],`,
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
function emitAddonsFile(instances: CredentialInstance[]): string {
  const blocks = instances.map((inst) =>
    [
      `wireAddon({`,
      `  name: ${q(inst.instanceName)},`,
      `  package: ${q(inst.package)},`,
      `  credentialOverrides: { ${q(inst.addonCredKey)}: ${q(inst.credentialName)} },`,
      `})`,
    ].join('\n')
  )
  return [
    `import { wireAddon } from '@pikku/core/rpc'`,
    ``,
    `// TODO(n8n): verify each addon package + credential key — packages are`,
    `// inferred from the n8n credential type and refined by the addon-map step.`,
    ...blocks.flatMap((b) => [``, b]),
    ``,
  ].join('\n')
}

/**
 * Generate Pikku source from a parsed n8n workflow. Pure — returns a path→content
 * map plus the integration manifest. No filesystem access.
 */
export function generateWorkflowFromN8n(
  parsed: ParsedWorkflow
): GenerateResult {
  const files: Record<string, string> = {}
  const dir = parsed.slug
  const credentialInstances = deriveCredentialInstances(parsed)
  const bindings = nodeInstanceBindings(credentialInstances)

  const emitGraph = parsed.shape !== 'agent-only'
  if (emitGraph) {
    files[`${dir}/${parsed.slug}.graph.ts`] = emitGraphFile(parsed)
  }
  if (parsed.agentNode) {
    files[`${dir}/${parsed.slug}.agent.ts`] = emitAgentFile(parsed)
  }

  const emittedStubRpc = new Set<string>()
  for (const node of parsed.nodes) {
    if (node.disabled) continue
    // Set / Edit Fields nodes map to @pikku/addon-graph's `editFields` — no stub.
    if (node.role === 'set') continue
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
  if (credentialInstances.length > 0) {
    files[`${dir}/${parsed.slug}.addons.gen.ts`] =
      emitAddonsFile(credentialInstances)
  }

  // Manifest: one entry per integration / agent-tool node.
  const agentName = parsed.slug
  const manifest: ManifestEntry[] = parsed.nodes
    .filter((n) => n.role === 'integration' || n.role === 'agentTool')
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

  return { files, manifest, credentialInstances }
}
