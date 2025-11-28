import { pikkuState } from '../../pikku-state.js'
import type {
  GraphNodeConfig,
  WorkflowGraphDefinition,
} from './workflow-graph.types.js'

/**
 * Wires a workflow graph for registration.
 *
 * @example
 * ```typescript
 * wireWorkflowGraph({
 *   name: 'orderProcessingWorkflow',
 *   triggers: {
 *     http: { route: '/orders', method: 'post' }
 *   },
 *   graph: graph((node) => ({
 *     entry: node({
 *       func: 'external:entryFunc',
 *       next: 'validateOrder',
 *     }),
 *
 *     validateOrder: node({
 *       func: 'external:validateOrderFunc',
 *       input: (ref) => ({
 *         orderId: ref('entry', 'orderId'),
 *       }),
 *       next: {
 *         'valid': 'processPayment',
 *         'invalid': 'reject'
 *       }
 *     }),
 *
 *     processPayment: node({
 *       func: 'external:processPaymentFunc',
 *       input: (ref) => ({
 *         orderId: ref('validateOrder', 'orderId'),
 *       }),
 *       next: ['sendConfirmation', 'updateInventory']
 *     }),
 *
 *     reject: node({
 *       func: 'external:rejectFunc',
 *       input: (ref) => ({
 *         orderId: ref('validateOrder', 'orderId'),
 *       }),
 *     }),
 *   })),
 * })
 * ```
 */
export function wireWorkflowGraph<
  Nodes extends Record<string, GraphNodeConfig<string>>,
>(definition: WorkflowGraphDefinition<Nodes>): void {
  const { name, graph } = definition

  // Validate that 'entry' node exists
  if (!('entry' in graph)) {
    throw new Error(`Workflow graph '${name}' must have an 'entry' node`)
  }

  // Register raw definition - CLI/inspector handles serialization
  const registrations = pikkuState(null, 'workflowGraphs', 'registrations')
  registrations.set(name, definition)
}

/**
 * Get a registered workflow graph by name
 */
export function getWorkflowGraph(
  name: string
): WorkflowGraphDefinition<any> | undefined {
  const registrations = pikkuState(null, 'workflowGraphs', 'registrations')
  return registrations.get(name)
}

/**
 * Get all registered workflow graphs
 */
export function getAllWorkflowGraphs(): Map<
  string,
  WorkflowGraphDefinition<any>
> {
  return pikkuState(null, 'workflowGraphs', 'registrations')
}
