export interface PikkuWorkflowGraphConfig<
  FuncMap extends Record<string, string>,
  T,
> {
  /** Keeps the graph in the codebase but out of the build. */
  disabled?: true
  /** Unique across the project. It is how the graph is started and how its runs are grouped. */
  name?: string
  /** What the graph does, for whoever is reading it rather than editing it. */
  description?: string
  /** Filters this graph in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
  /** The graph's steps, keyed by node id, each naming a function. `pikku meta` lists the names available here. */
  nodes: FuncMap
  /** Per-node settings — retries, timeouts, the edges between them. */
  config?: T
  /** Free text carried onto the rendered graph, for a reader who needs the reasoning the shape cannot show. */
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
