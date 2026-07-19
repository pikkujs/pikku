/**
 * Self-referencing `toolWorkflow` extraction.
 *
 * n8n exposes a workflow as an agent tool via a `toolWorkflow` sub-node whose
 * `workflowId` is `$workflow.id` (a self-reference). The tool body is a separate
 * branch of the *same* file, rooted at an `executeWorkflowTrigger` ("When
 * Executed by Another Workflow"). Pikku has no self-invocation-as-tool concept,
 * so that branch is lifted out into its own `pikkuWorkflowGraph` and the agent
 * references it through its `workflows: [ref(...)]` capability (agents invoke
 * workflows as tools, added in core alongside `tools`/`agents`).
 *
 * v1 handles the common single-trigger shape: one `executeWorkflowTrigger` whose
 * reachable main-branch nodes form one sub-workflow, referenced by every self
 * `toolWorkflow` in the file.
 */

import type { ParsedWorkflow, ParsedNode } from './types.js'
import { toCamelCase } from './naming.js'

export interface SubWorkflow {
  /** Registered graph name — the agent refs this in `workflows: [ref(name)]`. */
  name: string
  /** File/const slug (`<slug>.graph.ts`, `<slug>Workflow`). */
  slug: string
  /** The `executeWorkflowTrigger` nodeId — becomes the sub-graph's input. */
  triggerNodeId: string
  /** Body nodeIds reachable from the trigger (excluded from the main graph). */
  memberNodeIds: Set<string>
}

export interface SubWorkflowPlan {
  subWorkflows: SubWorkflow[]
  /** Body nodeIds lifted out of the main graph. */
  extractedNodeIds: Set<string>
  /** `executeWorkflowTrigger` nodeIds consumed by an extraction. */
  triggerNodeIds: Set<string>
  /** Self `toolWorkflow` nodeId → the sub-workflow name it invokes. */
  toolToWorkflow: Map<string, string>
}

const EMPTY: SubWorkflowPlan = {
  subWorkflows: [],
  extractedNodeIds: new Set(),
  triggerNodeIds: new Set(),
  toolToWorkflow: new Map(),
}

function isExecuteWorkflowTrigger(node: ParsedNode): boolean {
  return node.typeShort.toLowerCase() === 'executeworkflowtrigger'
}

function isSelfWorkflowTool(node: ParsedNode): boolean {
  return node.role === 'agentTool' && node.workflowRef?.kind === 'self'
}

/** Body node NAMES reachable from `startName` via main connections (exclusive). */
function reachableMembers(
  parsed: ParsedWorkflow,
  startName: string
): Set<string> {
  const members = new Set<string>()
  const queue = [startName]
  while (queue.length > 0) {
    const name = queue.shift()!
    for (const slot of parsed.connections[name]?.main ?? []) {
      for (const t of slot ?? []) {
        if (t?.node && !members.has(t.node)) {
          members.add(t.node)
          queue.push(t.node)
        }
      }
    }
  }
  return members
}

export function planSubWorkflows(parsed: ParsedWorkflow): SubWorkflowPlan {
  const triggers = parsed.nodes.filter(isExecuteWorkflowTrigger)
  const selfTools = parsed.nodes.filter(isSelfWorkflowTool)
  if (triggers.length !== 1 || selfTools.length === 0) return EMPTY

  const trigger = triggers[0]!
  const memberNames = reachableMembers(parsed, trigger.name)
  if (memberNames.size === 0) return EMPTY

  const idByName = new Map(parsed.nodes.map((n) => [n.name, n.nodeId]))
  const memberNodeIds = new Set<string>()
  for (const name of memberNames) {
    const id = idByName.get(name)
    if (id) memberNodeIds.add(id)
  }

  const toolName =
    typeof selfTools[0]!.parameters.name === 'string' &&
    selfTools[0]!.parameters.name
      ? (selfTools[0]!.parameters.name as string)
      : selfTools[0]!.name
  const slug = `${parsed.slug}_${toCamelCase(toolName)}`

  const subWorkflow: SubWorkflow = {
    name: slug,
    slug,
    triggerNodeId: trigger.nodeId,
    memberNodeIds,
  }

  const toolToWorkflow = new Map<string, string>()
  for (const tool of selfTools) toolToWorkflow.set(tool.nodeId, slug)

  return {
    subWorkflows: [subWorkflow],
    extractedNodeIds: new Set(memberNodeIds),
    triggerNodeIds: new Set([trigger.nodeId]),
    toolToWorkflow,
  }
}

/**
 * Build the sub-`ParsedWorkflow` for a lifted branch: its trigger + body nodes
 * and the connections between them, as a pure graph. Feeds straight into the
 * existing `emitGraphFile`.
 */
export function subWorkflowParsed(
  parsed: ParsedWorkflow,
  sub: SubWorkflow
): ParsedWorkflow {
  const keep = new Set([sub.triggerNodeId, ...sub.memberNodeIds])
  const nodes = parsed.nodes.filter((n) => keep.has(n.nodeId))
  const keepNames = new Set(nodes.map((n) => n.name))

  const connections: ParsedWorkflow['connections'] = {}
  for (const [sourceName, ports] of Object.entries(parsed.connections)) {
    if (keepNames.has(sourceName)) connections[sourceName] = ports
  }

  return {
    name: sub.name,
    slug: sub.slug,
    nodes,
    connections,
    stickyNotes: [],
    shape: 'pure-graph',
    agentNode: undefined,
  }
}
