/**
 * n8n export types (the subset we read) and the normalized intermediate
 * representation the codegen consumes.
 */

/** A single connection endpoint in an n8n `connections` map. */
export interface N8nConnectionTarget {
  node: string
  type: string
  index: number
}

/**
 * n8n `connections` are keyed by SOURCE node NAME. Each port (`main`, `ai_tool`,
 * `ai_languageModel`, `ai_memory`, `ai_outputParser`, …) holds an array of
 * output slots, each an array of targets.
 */
export type N8nConnections = Record<
  string,
  Record<string, Array<Array<N8nConnectionTarget>>>
>

export interface N8nCredentialRef {
  id?: string
  name?: string
}

export interface N8nNode {
  id: string
  name: string
  type: string
  typeVersion?: number
  position?: [number, number]
  parameters?: Record<string, unknown>
  credentials?: Record<string, N8nCredentialRef>
  notes?: string
  disabled?: boolean
}

export interface N8nWorkflow {
  name?: string
  nodes: N8nNode[]
  connections: N8nConnections
}

/** How a node maps onto the Pikku world. */
export type NodeRole =
  | 'trigger'
  | 'integration'
  | 'code'
  | 'agent'
  | 'agentTool'
  | 'model'
  | 'memory'
  | 'outputParser'
  | 'vectorStore'
  | 'set'
  | 'http'
  | 'branch'
  | 'native'
  | 'noop'
  | 'control'
  | 'subworkflow'
  | 'sticky'
  | 'other'

/**
 * A reference from an executeWorkflow / toolWorkflow node to another workflow.
 * - `self`    — `={{ $workflow.id }}`: the workflow re-invokes itself (recursion).
 * - `static`  — a literal n8n workflow id; resolved to a Pikku workflow name via
 *               the import-set index (`targetId` holds the id).
 * - `dynamic` — a runtime expression (or empty): the target is chosen from data,
 *               so it can't be identified statically.
 */
export interface WorkflowRef {
  kind: 'self' | 'static' | 'dynamic'
  /** The literal n8n workflow id, for `static`. */
  targetId?: string
}

export interface ParsedNode {
  /** Original n8n node id */
  id: string
  /** Original n8n node name (used as the graph nodeId, sanitized) */
  name: string
  /** Sanitized identifier safe for use as a graph node id / variable */
  nodeId: string
  /** Full n8n type, e.g. "n8n-nodes-base.gmailTool" */
  type: string
  /** Short type, e.g. "gmailTool" (last dotted segment) */
  typeShort: string
  typeVersion?: number
  parameters: Record<string, unknown>
  credentials?: Record<string, N8nCredentialRef>
  notes?: string
  disabled: boolean
  role: NodeRole
  /** RPC/function name generated for this node (stub or real). */
  rpcName: string
  /** Set on executeWorkflow / toolWorkflow nodes — their sub-workflow target. */
  workflowRef?: WorkflowRef
}

/**
 * A structured reason a workflow could not be imported. Emitted instead of a
 * broken stub when the *input* is un-importable (a dangling sub-workflow
 * reference, a runtime-dynamic target, …) so the caller can skip the workflow
 * and report why, rather than emit code that can never run.
 */
export interface ImportDiagnostic {
  /** Stable identifier for a Pikku n8n-import diagnostic. */
  diagnostic: 'PIKKU_N8N_IMPORT_DIAGNOSTIC'
  type: 'error' | 'warning'
  reason: 'missing-subworkflow' | 'dynamic-subworkflow-target'
  message: string
  /** n8n node name that triggered the diagnostic, when applicable. */
  node?: string
}

/**
 * Resolve an n8n workflow id to the registered Pikku workflow name (the `name`
 * passed to `pikkuWorkflowGraph`) — built from the whole import set. Returns
 * undefined when the target isn't part of the import.
 */
export type WorkflowRefResolver = (n8nId: string) => string | undefined

/** Top-level artifact shape for the whole workflow. */
export type WorkflowShape = 'agent-only' | 'graph-with-agent' | 'pure-graph'

export interface ParsedWorkflow {
  name: string
  /** Sanitized workflow identifier (file/base name). */
  slug: string
  nodes: ParsedNode[]
  connections: N8nConnections
  /** Free-text sticky-note contents (graph-level notes). */
  stickyNotes: string[]
  shape: WorkflowShape
  /** The single agent node, when the workflow has one. */
  agentNode?: ParsedNode
}
