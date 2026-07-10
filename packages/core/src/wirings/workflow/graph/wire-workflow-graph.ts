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
  /**
   * Graph-level free-text notes (e.g. imported sticky notes). Non-semantic:
   * excluded from the graph topology hash.
   */
  notes?: string[]
}

export interface PikkuWorkflowGraphResult {
  __type: 'pikkuWorkflowGraph'
  name?: string
  description?: string
  tags?: string[]
  notes?: string[]
}

export function pikkuWorkflowGraph<
  const FuncMap extends Record<string, string>,
>(config: PikkuWorkflowGraphConfig<FuncMap, any>): PikkuWorkflowGraphResult {
  return {
    __type: 'pikkuWorkflowGraph',
    name: config.name,
    description: config.description,
    tags: config.tags,
    notes: config.notes,
  }
}
