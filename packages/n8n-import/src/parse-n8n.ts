import type {
  N8nWorkflow,
  N8nNode,
  ParsedNode,
  ParsedWorkflow,
  NodeRole,
  WorkflowShape,
  WorkflowRef,
} from './types.js'
import {
  sanitizeIdentifier,
  sanitizeDisplayName,
  typeShort,
  integrationRpcName,
  codeRpcName,
  vectorRpcName,
  dedupe,
} from './naming.js'
import { normalizeBranch } from './branch.js'
import { nativeSpecFor } from './native-map.js'

/**
 * A workflow whose topology has no Pikku equivalent by design (not a malformed
 * input or an importer bug) — e.g. a respondToWebhook that responds mid-flow.
 * Distinct from a generic parse error so callers can account for it as a
 * deliberate skip rather than a failure.
 */
export class UnsupportedTopologyError extends Error {
  readonly reason: string
  constructor(reason: string, message: string) {
    super(message)
    this.name = 'UnsupportedTopologyError'
    this.reason = reason
  }
}

/**
 * n8n LangChain *chain* nodes (as opposed to the Agent node) — a prompt + model,
 * no tools. They map onto a tools-less `pikkuAIAgent` (goal = prompt,
 * output = schema). `chainRetrievalQa` is excluded: it needs a vector store
 * (blocked on #902), so it stays a stub.
 */
const CHAIN_AGENT_TYPES = new Set([
  'chainllm',
  'informationextractor',
  'textclassifier',
  'chainsummarization',
  'sentimentanalysis',
])

export function isChainAgentType(typeShort: string): boolean {
  return CHAIN_AGENT_TYPES.has(typeShort.toLowerCase())
}

/** Classify an n8n node by its type string. */
function classifyByType(type: string): NodeRole {
  const short = typeShort(type).toLowerCase()
  const full = type.toLowerCase()

  if (short.endsWith('stickynote')) return 'sticky'
  // `*trigger*` catches most; `cron` / `interval` are legacy schedule triggers
  // that predate the naming convention. Triggers are separate wiring, not graph
  // nodes.
  if (
    short.includes('trigger') ||
    short === 'webhook' ||
    short === 'cron' ||
    short === 'interval'
  )
    return 'trigger'
  if (full.includes('langchain.agent') || short === 'agent') return 'agent'
  if (
    short.startsWith('lmchat') ||
    short.startsWith('lm') ||
    short.startsWith('embeddings')
  )
    return 'model'
  if (short.includes('memory')) return 'memory'
  if (short.includes('outputparser')) return 'outputParser'
  if (short.includes('vectorstore')) return 'vectorStore'
  // langchain tool wrappers + any `*Tool` service node
  if (short.endsWith('tool') || short.startsWith('tool')) return 'agentTool'
  // Execute Workflow — a sub-workflow call (Pikku `workflow.do(<name>)`). The
  // tool variant (toolWorkflow) is caught above as an agentTool.
  if (short === 'executeworkflow') return 'subworkflow'
  if (short === 'code' || short === 'function' || short === 'functionitem')
    return 'code'
  if (short === 'set' || short === 'editfields') return 'set'
  // A No Op node does nothing — it's a transparent pass-through, dropped from
  // the graph with its edges rewired straight through.
  if (short === 'noop') return 'noop'
  if (['if', 'switch', 'merge', 'splitinbatches', 'filter'].includes(short))
    return 'control'
  return 'integration'
}

/**
 * An n8n HTTP Request node with no authentication maps to @pikku/addon-graph's
 * native `httpRequest`. An authenticated one must route through a credentialed
 * addon instead of a raw call, so it stays an integration stub (addon-map's job).
 */
function isNoAuthHttpRequest(node: N8nNode): boolean {
  if (typeShort(node.type).toLowerCase() !== 'httprequest') return false
  const auth = node.parameters?.authentication
  return auth === undefined || auth === 'none'
}

/**
 * Read an executeWorkflow / toolWorkflow node's `workflowId` (scalar or
 * resource-locator) and classify what it points at. `={{ $workflow.id }}` is the
 * workflow calling itself (recursion); a bare literal is a static id; any other
 * expression (or an empty value) is a runtime-dynamic target we can't identify.
 */
function readWorkflowRef(parameters: Record<string, unknown>): WorkflowRef {
  const w = parameters.workflowId
  const raw =
    w && typeof w === 'object'
      ? ((w as { value?: unknown }).value ?? '')
      : (w ?? '')
  const v = String(raw).trim()
  if (v.includes('$workflow.id')) return { kind: 'self' }
  if (v === '' || v.startsWith('=') || v.includes('{{'))
    return { kind: 'dynamic' }
  return { kind: 'static', targetId: v }
}

/** Nodes that never become graph nodes / agent tools — pure config or decoration. */
export function isAbsorbedRole(role: NodeRole): boolean {
  return (
    role === 'sticky' ||
    role === 'model' ||
    role === 'memory' ||
    role === 'outputParser'
  )
}

function rpcNameFor(role: NodeRole, node: N8nNode): string {
  switch (role) {
    case 'code':
      return codeRpcName(node.name)
    case 'vectorStore':
      return vectorRpcName(node.name)
    case 'set':
      return 'graph:editFields'
    case 'http':
      return 'graph:httpRequest'
    case 'branch':
      return 'graph:branch'
    case 'native':
      return nativeSpecFor(typeShort(node.type), node.parameters ?? {})!.rpc
    default:
      return integrationRpcName(node.type, node.name)
  }
}

/**
 * Which node names are targets of an `ai_tool` connection — i.e. attached to an
 * agent as tools (LLM-invoked), rather than main-flow nodes.
 */
function collectAgentToolNames(wf: N8nWorkflow): Set<string> {
  const toolSources = new Set<string>()
  for (const [source, ports] of Object.entries(wf.connections ?? {})) {
    if (ports.ai_tool && ports.ai_tool.length > 0) {
      toolSources.add(source)
    }
  }
  return toolSources
}

/** Decide the top-level artifact shape from the classified nodes. */
export function decideShape(nodes: ParsedNode[]): WorkflowShape {
  const agents = nodes.filter((n) => n.role === 'agent')
  if (agents.length === 0) return 'pure-graph'
  const mainFlow = nodes.filter(
    (n) =>
      n.role !== 'agent' &&
      n.role !== 'agentTool' &&
      !isAbsorbedRole(n.role) &&
      n.role !== 'trigger'
  )
  // Only a single agent with no other flow collapses to a lone `.agent.ts`.
  // Multiple agents must be wired together in a graph.
  return agents.length === 1 && mainFlow.length === 0
    ? 'agent-only'
    : 'graph-with-agent'
}

/**
 * Parse an n8n workflow export into the normalized IR. Pure — no fs.
 *
 * `nameHint` (e.g. the source filename, minus extension) names the workflow when
 * the export itself is nameless — ~half of real-world exports carry no `name`,
 * and without a hint they would all collapse onto the same `importedWorkflow`
 * slug. A present, non-blank `wf.name` always wins over the hint.
 */
export function parseN8n(raw: unknown, nameHint?: string): ParsedWorkflow {
  const wf = raw as N8nWorkflow
  if (!wf || !Array.isArray(wf.nodes)) {
    throw new Error('Invalid n8n workflow: missing `nodes` array')
  }

  const rawName = wf.name?.trim() || nameHint?.trim() || 'imported-workflow'
  const name = sanitizeDisplayName(rawName)
  const slug = sanitizeIdentifier(name)
  const toolNames = collectAgentToolNames(wf)

  const seenNodeIds = new Set<string>()
  const seenRpcNames = new Set<string>()
  const stickyNotes: string[] = []
  const nodes: ParsedNode[] = []

  for (const node of wf.nodes) {
    let role = classifyByType(node.type)

    if (role === 'sticky') {
      const content = (node.parameters?.content as string | undefined)?.trim()
      if (content) stickyNotes.push(content)
      continue
    }

    // Respond To Webhook: a Pikku graph's output IS its HTTP response, produced
    // at the end. A terminal respondToWebhook is therefore a transparent drop.
    // A mid-flow one (respond early, then keep processing) has no Pikku
    // equivalent — fail the import loudly rather than silently changing behavior.
    if (typeShort(node.type).toLowerCase() === 'respondtowebhook') {
      const out = wf.connections?.[node.name]?.main
      const hasSuccessors =
        Array.isArray(out) &&
        out.some((slot) => Array.isArray(slot) && slot.length > 0)
      if (hasSuccessors) {
        throw new UnsupportedTopologyError(
          'midflow-response',
          `Cannot import "${name}": respondToWebhook node "${node.name}" responds mid-workflow (it has downstream nodes). Pikku graphs produce their response at the end, so respond-early-then-continue is unsupported.`
        )
      }
      role = 'noop'
    }

    // A service node attached to an agent via ai_tool is an agent tool, not a
    // main-flow node — regardless of whether its type ends in `Tool`.
    if (role === 'integration' && toolNames.has(node.name)) {
      role = 'agentTool'
    }

    // A no-auth HTTP Request node is @pikku/addon-graph's native httpRequest.
    if (role === 'integration' && isNoAuthHttpRequest(node)) {
      role = 'http'
    }

    // An IF / Filter / Switch whose conditions we can normalize maps to
    // @pikku/addon-graph's native `branch`; ones we can't (e.g. Switch
    // expression-mode) stay a `control` stub.
    if (
      role === 'control' &&
      normalizeBranch({
        typeShort: typeShort(node.type),
        parameters: node.parameters ?? {},
      })
    ) {
      role = 'branch'
    }

    // A node whose type maps 1:1 onto an @pikku/addon-graph function (e.g.
    // Stop And Error → graph:stopAndError) becomes a native addon call.
    if (
      (role === 'integration' || role === 'control') &&
      nativeSpecFor(typeShort(node.type), node.parameters ?? {})
    ) {
      role = 'native'
    }

    const nodeId = dedupe(sanitizeIdentifier(node.name), seenNodeIds)
    // Set / Edit Fields, no-auth HTTP, branch, and other native addon nodes all
    // share a @pikku/addon-graph RPC — a shared addon function, never deduped.
    const rpcName =
      role === 'set' ||
      role === 'http' ||
      role === 'branch' ||
      role === 'native'
        ? rpcNameFor(role, node)
        : dedupe(rpcNameFor(role, node), seenRpcNames)

    // executeWorkflow (graph node) and toolWorkflow (agent tool) both carry a
    // sub-workflow target we resolve at codegen time.
    const short = typeShort(node.type).toLowerCase()
    const workflowRef =
      short === 'executeworkflow' || short === 'toolworkflow'
        ? readWorkflowRef(node.parameters ?? {})
        : undefined

    nodes.push({
      id: node.id,
      name: node.name,
      nodeId,
      type: node.type,
      typeShort: typeShort(node.type),
      typeVersion: node.typeVersion,
      parameters: node.parameters ?? {},
      credentials: node.credentials,
      notes: node.notes,
      disabled: node.disabled ?? false,
      role,
      rpcName,
      workflowRef,
    })
  }

  // LangChain chain nodes (chainLlm, informationExtractor, …) each map onto a
  // tools-less agent. Promote every one so they flow through the agent
  // machinery — one or many per workflow, and alongside any real Agent node.
  // Each agent's tools are attributed by its own `ai_tool` connections, so a
  // chain (which has none) and a real Agent coexist without cross-wiring.
  for (const node of nodes) {
    if (node.role === 'integration' && isChainAgentType(node.typeShort)) {
      node.role = 'agent'
    }
  }

  const shape = decideShape(nodes)
  const agentNode = nodes.find((n) => n.role === 'agent')

  return {
    name,
    slug,
    nodes,
    connections: wf.connections ?? {},
    stickyNotes,
    shape,
    agentNode,
  }
}
