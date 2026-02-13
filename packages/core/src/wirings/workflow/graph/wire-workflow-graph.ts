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

export interface PikkuWorkflowGraphResult {
  __type: 'pikkuWorkflowGraph'
  name?: string
  description?: string
  tags?: string[]
}

export function pikkuWorkflowGraph<
  const FuncMap extends Record<string, string>,
>(config: PikkuWorkflowGraphConfig<FuncMap, any>): PikkuWorkflowGraphResult {
  return {
    __type: 'pikkuWorkflowGraph',
    name: config.name,
    description: config.description,
    tags: config.tags,
  }
}
