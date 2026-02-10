import type { GraphNodeConfig } from './workflow-graph.types.js'
import { wireWorkflow } from '../wire-workflow.js'

export interface PikkuWorkflowGraphConfig<
  FuncMap extends Record<string, string>,
  T,
> {
  disabled?: true
  name?: string
  description?: string
  tags?: string[]
  nodes: FuncMap
  config?: T
}

export interface PikkuWorkflowGraphResult<T> {
  __type: 'pikkuWorkflowGraph'
  name?: string
  description?: string
  tags?: string[]
  graph: T
}

export function wireWorkflowGraph<const FuncMap extends Record<string, string>>(
  graphBuilder: (
    funcMap: FuncMap,
    config: any
  ) => Record<string, GraphNodeConfig<string>>,
  config: PikkuWorkflowGraphConfig<FuncMap, any>
): PikkuWorkflowGraphResult<
  Record<
    Extract<keyof FuncMap, string>,
    GraphNodeConfig<Extract<keyof FuncMap, string>>
  >
> {
  const result: PikkuWorkflowGraphResult<
    Record<
      Extract<keyof FuncMap, string>,
      GraphNodeConfig<Extract<keyof FuncMap, string>>
    >
  > = {
    __type: 'pikkuWorkflowGraph',
    name: config.name,
    description: config.description,
    tags: config.tags,
    graph: graphBuilder(config.nodes, config.config) as Record<
      Extract<keyof FuncMap, string>,
      GraphNodeConfig<Extract<keyof FuncMap, string>>
    >,
  }
  if (!config.disabled) {
    wireWorkflow({ graph: result } as any)
  }
  return result
}
