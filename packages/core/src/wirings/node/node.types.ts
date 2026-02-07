export type NodeType = 'trigger' | 'action' | 'end'

export type CoreNodeConfig = {
  displayName: string
  category: string
  type: NodeType
  errorOutput?: boolean
}

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

export type NodesMeta = Record<string, NodeMeta>
