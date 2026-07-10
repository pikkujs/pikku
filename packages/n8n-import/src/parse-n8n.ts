import type {
  N8nWorkflow,
  N8nNode,
  ParsedNode,
  ParsedWorkflow,
  NodeRole,
  WorkflowShape,
} from './types.js'
import {
  sanitizeIdentifier,
  typeShort,
  integrationRpcName,
  codeRpcName,
  vectorRpcName,
  dedupe,
} from './naming.js'

/** Classify an n8n node by its type string. */
function classifyByType(type: string): NodeRole {
  const short = typeShort(type).toLowerCase()
  const full = type.toLowerCase()

  if (short.endsWith('stickynote')) return 'sticky'
  if (short.includes('trigger') || short === 'webhook') return 'trigger'
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
  if (short === 'code' || short === 'function' || short === 'functionitem')
    return 'code'
  if (short === 'set' || short === 'editfields') return 'set'
  if (
    ['if', 'switch', 'merge', 'splitinbatches', 'filter', 'noop'].includes(
      short
    )
  )
    return 'control'
  return 'integration'
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
function decideShape(nodes: ParsedNode[]): WorkflowShape {
  const agents = nodes.filter((n) => n.role === 'agent')
  if (agents.length === 0) return 'pure-graph'
  const mainFlow = nodes.filter(
    (n) =>
      n.role !== 'agent' &&
      n.role !== 'agentTool' &&
      !isAbsorbedRole(n.role) &&
      n.role !== 'trigger'
  )
  return mainFlow.length === 0 ? 'agent-only' : 'graph-with-agent'
}

/**
 * Parse an n8n workflow export into the normalized IR. Pure — no fs.
 */
export function parseN8n(raw: unknown): ParsedWorkflow {
  const wf = raw as N8nWorkflow
  if (!wf || !Array.isArray(wf.nodes)) {
    throw new Error('Invalid n8n workflow: missing `nodes` array')
  }

  const name = wf.name || 'imported-workflow'
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

    // A service node attached to an agent via ai_tool is an agent tool, not a
    // main-flow node — regardless of whether its type ends in `Tool`.
    if (role === 'integration' && toolNames.has(node.name)) {
      role = 'agentTool'
    }

    const nodeId = dedupe(sanitizeIdentifier(node.name), seenNodeIds)
    // Set / Edit Fields nodes all share @pikku/addon-graph's `editFields` RPC —
    // a shared addon function, never deduped into per-node names.
    const rpcName =
      role === 'set'
        ? rpcNameFor(role, node)
        : dedupe(rpcNameFor(role, node), seenRpcNames)

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
    })
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
