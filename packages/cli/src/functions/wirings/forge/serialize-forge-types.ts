/**
 * Generates type definitions for Forge wirings with typed category and RPC validation
 */
export const serializeForgeTypes = (
  rpcMapImportPath: string,
  categories: string[] | undefined
) => {
  // Generate category union type - 'never' if no categories configured
  const categoryType = categories?.length
    ? categories.map((c) => `'${c}'`).join(' | ')
    : 'never'

  return `/**
 * Forge-specific type definitions for typed wireForgeNode
 */

import { wireForgeNode as wireForgeNodeCore } from '@pikku/core/forge-node'
import type { CoreForgeNode } from '@pikku/core/forge-node'
import type { FlattenedRPCMap } from '${rpcMapImportPath}'

/**
 * Valid category values for forge nodes.
 * ${categories?.length ? `Configured categories: ${categories.join(', ')}` : 'No categories configured - wireForgeNode cannot be used until forge.node.categories is defined in pikku.config.json.'}
 */
export type ForgeCategory = ${categoryType}

/**
 * Valid RPC names that can be used with forge nodes.
 * These are derived from the FlattenedRPCMap which includes both local and external package RPCs.
 */
export type ForgeRPCName = keyof FlattenedRPCMap

/**
 * Typed forge node configuration.
 * Validates that category and rpc are valid values.
 */
export type TypedForgeNode = Omit<CoreForgeNode, 'category' | 'rpc'> & {
  /** Grouping category (validated against forge.node.categories in config) */
  category: ForgeCategory
  /** RPC name to call when node executes (must be a valid RPC name) */
  rpc: ForgeRPCName
}

/**
 * Registers a Forge node with validated category and RPC.
 *
 * @param config - Forge node configuration with typed category and rpc
 *
 * @example
 * \`\`\`typescript
 * wireForgeNode({
 *   name: 'send-email',
 *   displayName: 'Send Email',
 *   category: 'Communication', // Must be in forge.node.categories
 *   type: 'action',
 *   rpc: 'sendEmail', // Must be a valid RPC name
 *   description: 'Sends an email to a recipient'
 * })
 * \`\`\`
 */
export const wireForgeNode = (config: TypedForgeNode): void => {
  wireForgeNodeCore(config as CoreForgeNode)
}
`
}
