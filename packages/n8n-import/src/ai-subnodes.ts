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

/**
 * Follow a chain of reverse `ai_*` ports hop by hop, returning the terminal
 * sub-node (or `undefined` if any hop is missing). A RAG retrieval chain nests
 * its sub-nodes — `chainRetrievalQa —ai_retriever→ retriever —ai_vectorStore→
 * store —ai_embedding→ embeddings` — so resolving the store namespace from the
 * chain node means walking `['ai_retriever', 'ai_vectorStore']`.
 */
export function walkAiChain(
  parsed: ParsedWorkflow,
  fromName: string,
  ports: string[]
): ParsedNode | undefined {
  let current: ParsedNode | undefined
  let name = fromName
  for (const port of ports) {
    current = findAgentSubNode(parsed, name, port)
    if (!current) return undefined
    name = current.name
  }
  return current
}
