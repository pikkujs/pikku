/** The role a function plays as a node in a workflow graph: something that starts a flow, a step within one, or a terminal step. */
export type NodeType = 'trigger' | 'action' | 'end'

/** How a function is presented as a node in a workflow graph editor: its label, palette category and role, and whether it exposes an error output. */
export type CoreNodeConfig = {
  displayName: string
  category: string
  type: NodeType
  errorOutput?: boolean
}

/** Generated metadata for one function exposed as a graph node. */
export type NodeMeta = {
  name: string
  displayName: string
  category: string
  type: NodeType
  rpc: string
  description?: string
  errorOutput: boolean
  inputSchemaName: string | null
  outputSchemaName: string | null
  tags?: string[]
}

/** Generated metadata for every function exposed as a graph node, keyed by name. */
export type NodesMeta = Record<string, NodeMeta>
