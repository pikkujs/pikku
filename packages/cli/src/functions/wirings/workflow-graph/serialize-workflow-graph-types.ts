/**
 * Generates type definitions for workflow graph wirings
 */
export const serializeWorkflowGraphTypes = (rpcMapImportPath: string) => {
  return `/**
 * Workflow Graph type definitions with typed RPC references
 */

import type { FlattenedRPCMap } from '${rpcMapImportPath}'
import type { GraphNodeConfig, WorkflowGraphTriggers } from '@pikku/core'
import { createGraph } from '@pikku/core'

/**
 * Type-safe graph builder with full RPC autocomplete.
 *
 * Two-step API:
 * 1. First call: provide node ID -> RPC name mapping (autocompletes RPC names)
 * 2. Second call: provide node configs (autocompletes next, ref nodeId, and ref output keys)
 *
 * @example
 * \`\`\`typescript
 * graph({
 *   entry: 'createUserProfile',      // autocompletes RPC names
 *   sendWelcome: 'sendEmail',
 * })({
 *   entry: { next: 'sendWelcome' },  // 'sendWelcome' autocompletes
 *   sendWelcome: {
 *     input: (ref) => ({
 *       to: ref('entry', 'email'),   // 'entry' and 'email' both autocomplete!
 *     }),
 *   },
 * })
 * \`\`\`
 */
export const graph = createGraph<FlattenedRPCMap>()

/**
 * Type-safe wireWorkflowGraph with RPC-aware graph definition.
 *
 * @example
 * \`\`\`typescript
 * import { wireWorkflowGraph, graph } from './.pikku/workflow/pikku-workflow-graph-types.gen.js'
 *
 * wireWorkflowGraph({
 *   name: 'userOnboarding',
 *   triggers: { http: { route: '/onboard', method: 'post' } },
 *   graph: graph({
 *     entry: {
 *       func: 'createUserProfile',  // autocompletes RPC names
 *       next: 'sendWelcome',
 *     },
 *     sendWelcome: {
 *       func: 'sendEmail',
 *       input: (ref) => ({
 *         to: ref('entry', 'email'),  // 'email' autocompletes from createUserProfile output
 *       }),
 *     },
 *   }),
 * })
 * \`\`\`
 */
export function wireWorkflowGraph<
  T extends Record<string, GraphNodeConfig<Extract<keyof T, string>>>
>(definition: {
  name: string
  triggers: WorkflowGraphTriggers
  graph: T
}): void {
  // Import and call the core wireWorkflowGraph at runtime
  const { wireWorkflowGraph: coreWire } = require('@pikku/core')
  coreWire(definition)
}
`
}
