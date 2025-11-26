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
 * Forge-specific type definitions for typed wireForgeNode and wireForgeCredential
 */

import { wireForgeNode as wireForgeNodeCore, wireForgeCredential as wireForgeCredentialCore } from '@pikku/core/forge-node'
import type { CoreForgeNode, CoreForgeCredential } from '@pikku/core/forge-node'
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

/**
 * Registers a Forge credential definition.
 * Credentials define secrets/API keys required by the package.
 *
 * @template T - Zod schema type for the credential structure
 * @param config - Forge credential configuration
 *
 * @example
 * \`\`\`typescript
 * import { z } from 'zod'
 *
 * const apiCredentials = z.object({
 *   apiKey: z.string().describe('API key for authentication'),
 *   apiSecret: z.string().describe('API secret')
 * })
 *
 * wireForgeCredential({
 *   name: 'example-api',
 *   displayName: 'Example API Credentials',
 *   description: 'Credentials for the example external API',
 *   secretId: 'EXAMPLE_API_CREDENTIALS',
 *   schema: apiCredentials
 * })
 * \`\`\`
 */
export const wireForgeCredential = <T>(config: CoreForgeCredential<T>): void => {
  wireForgeCredentialCore(config)
}
`
}
