import type { ParsedWorkflow, ParsedNode } from './types.js'

/**
 * Find the sub-node connected INTO `agentName` via a reverse `ai_*` port. In n8n
 * an AI sub-node (model / memory / output parser) is the connection *source* and
 * the agent is the *target*, so we scan every source's named port for one whose
 * slots target the agent.
 */
export function findAgentSubNode(
  parsed: ParsedWorkflow,
  agentName: string,
  port: string
): ParsedNode | undefined {
  for (const [sourceName, ports] of Object.entries(parsed.connections)) {
    const slots = ports[port]
    if (!slots) continue
    const targetsAgent = slots.some(
      (slot) => Array.isArray(slot) && slot.some((t) => t?.node === agentName)
    )
    if (targetsAgent) {
      const node = parsed.nodes.find((n) => n.name === sourceName)
      if (node) return node
    }
  }
  return undefined
}
