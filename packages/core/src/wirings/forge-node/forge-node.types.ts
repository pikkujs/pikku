/**
 * Forge node types for workflow builder visualization.
 * Forge metadata is now defined inline via the `forge` property on pikkuFunc/pikkuSessionlessFunc.
 * The CLI extracts this via AST and generates JSON metadata.
 */

/**
 * The type of forge node.
 * - trigger: Starts workflows (webhooks, schedules, events)
 * - action: Operations that do something (API calls, send email, database ops)
 * - end: Terminal nodes with no outputs (logging, notifications)
 */
export type ForgeNodeType = 'trigger' | 'action' | 'end'

/**
 * Inline forge configuration for pikkuFunc/pikkuSessionlessFunc.
 * Replaces the separate wireForgeNode() call.
 */
export type CoreNodeConfig = {
  /** Human-readable name for UI display */
  displayName: string
  /** Grouping category (validated against forge.node.categories in config) */
  category: string
  /** Node type determining behavior and outputs */
  type: ForgeNodeType
  /** Whether to add an error output port alongside the default output */
  errorOutput?: boolean
}

/**
 * Metadata generated for each forge node.
 * This is the output type that the CLI generates.
 */
export type ForgeNodeMeta = {
  name: string
  displayName: string
  category: string
  type: ForgeNodeType
  /** RPC name (local, remapped by Forge for external packages) */
  rpc: string
  description?: string
  /** Whether node has error output port */
  errorOutput: boolean
  /** Input schema name extracted from RPC */
  inputSchemaName: string | null
  /** Output schema name extracted from RPC */
  outputSchemaName: string | null
  tags?: string[]
}

/**
 * Record of all forge node metadata, keyed by node name.
 */
export type ForgeNodesMeta = Record<string, ForgeNodeMeta>

/**
 * @deprecated Use the `forge` property on pikkuFunc/pikkuSessionlessFunc instead.
 * This exists only for backward compatibility with existing code.
 */
export type CoreForgeNode = {
  name: string
  displayName: string
  category: string
  type: ForgeNodeType
  rpc: string
  description?: string
  errorOutput?: boolean
  tags?: string[]
}

/**
 * @deprecated Use the `forge` property on pikkuFunc/pikkuSessionlessFunc instead.
 * No-op function kept for backward compatibility.
 */
export const wireForgeNode = (_config: CoreForgeNode): void => {
  // No-op - metadata only, extracted by CLI via AST
}
