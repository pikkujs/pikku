import { pikkuState } from '../../pikku-state.js'
import type { GraphNodeConfig } from './graph/workflow-graph.types.js'

/**
 * Workflow definition with DSL function
 */
export interface WorkflowDefinitionFunc {
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
 * Wire a workflow.
 * Accepts either a DSL function (func) or a graph definition (graph).
 *
 * @example
 * ```typescript
 * // DSL workflow
 * wireWorkflow({
 *   func: myWorkflowFunc,
 * })
 *
 * // Graph workflow
 * wireWorkflow({
 *   graph: myGraphWorkflow,
 * })
 * ```
 */
export function wireWorkflow<T extends Record<string, GraphNodeConfig<string>>>(
  definition: WorkflowDefinitionFunc | WorkflowDefinitionGraph<T>
): void {
  if (isWorkflowDefinitionFunc(definition)) {
    const wirings = pikkuState(null, 'workflows', 'wirings')
    wirings.set(definition.func, {
      func: definition.func,
    })
  } else if (isWorkflowDefinitionGraph(definition)) {
    const graphWirings = pikkuState(null, 'workflows', 'graphWirings')
    graphWirings.set(definition.graph, {
      graph: definition.graph,
    })
  }
}
