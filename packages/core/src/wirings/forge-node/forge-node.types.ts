/**
 * Forge node types for workflow builder visualization.
 * wireForgeNode is metadata-only - no runtime behavior.
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
 * Configuration for wireForgeNode.
 * This is the input type that developers use when defining nodes.
 */
export type CoreForgeNode = {
  /** Unique identifier for this node */
  name: string
  /** Human-readable name for UI display */
  displayName: string
  /** Grouping category (validated against forge.node.categories in config) */
  category: string
  /** Node type determining behavior and outputs */
  type: ForgeNodeType
  /** RPC name to call when node executes (local name, Forge handles package aliasing) */
  rpc: string
  /** Optional description for UI */
  description?: string
  /** Optional icon filename (references file in forge.node.iconsDir) */
  icon?: string
  /** Whether to add an error output port alongside the default output */
  errorOutput?: boolean
  /** Optional tags for filtering/categorization */
  tags?: string[]
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
  /** Sanitized inline SVG content */
  icon?: string
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
 * No-op function for wireForgeNode.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing.
 */
export const wireForgeNode = (_config: CoreForgeNode): void => {
  // No-op - metadata only, extracted by CLI via AST
}
