import { pikkuState } from '../../pikku-state.js'
import type { WorkflowWires } from './workflow.types.js'
import type { GraphNodeConfig } from './graph/workflow-graph.types.js'

/**
 * Workflow definition with DSL function
 */
export interface WorkflowDefinitionFunc {
  wires: WorkflowWires
  func: { func: (...args: any[]) => any } | ((...args: any[]) => any)
}

/**
 * Workflow definition with graph
 */
export interface WorkflowDefinitionGraph<
  T extends Record<string, GraphNodeConfig<string>> = Record<
    string,
    GraphNodeConfig<string>
  >,
> {
  wires: WorkflowWires
  graph: T
}

/**
 * Union type for workflow definitions
 */
export type WorkflowDefinition<
  T extends Record<string, GraphNodeConfig<string>> = Record<
    string,
    GraphNodeConfig<string>
  >,
> = WorkflowDefinitionFunc | WorkflowDefinitionGraph<T>

/**
 * Type guard for DSL workflow definition
 */
function isWorkflowDefinitionFunc(
  def: WorkflowDefinition
): def is WorkflowDefinitionFunc {
  return 'func' in def
}

/**
 * Type guard for graph workflow definition
 */
function isWorkflowDefinitionGraph(
  def: WorkflowDefinition
): def is WorkflowDefinitionGraph {
  return 'graph' in def
}

/**
 * Wire a workflow with triggers.
 * Accepts either a DSL function (func) or a graph definition (graph).
 *
 * @example
 * ```typescript
 * // DSL workflow
 * wireWorkflow({
 *   wires: { http: { route: '/start', method: 'post' } },
 *   func: myWorkflowFunc,
 * })
 *
 * // Graph workflow
 * wireWorkflow({
 *   wires: { http: { route: '/graph-start', method: 'post' } },
 *   graph: myGraphWorkflow,
 * })
 * ```
 */
export function wireWorkflow<T extends Record<string, GraphNodeConfig<string>>>(
  definition: WorkflowDefinitionFunc | WorkflowDefinitionGraph<T>
): void {
  if (isWorkflowDefinitionFunc(definition)) {
    // DSL workflow - store wiring for later registration by inspector
    const wirings = pikkuState(null, 'workflows', 'wirings')
    // The wiring will be matched to the function by the inspector
    // Store the func reference and wires
    wirings.set(definition.func, {
      wires: definition.wires,
      func: definition.func,
    })
  } else if (isWorkflowDefinitionGraph(definition)) {
    // Graph workflow - store for registration
    const graphWirings = pikkuState(null, 'workflows', 'graphWirings')
    // Store the graph reference and wires
    graphWirings.set(definition.graph, {
      wires: definition.wires,
      graph: definition.graph,
    })
  }
}
