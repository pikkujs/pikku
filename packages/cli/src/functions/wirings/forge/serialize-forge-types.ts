/**
 * Generates type definitions for Forge with typed category validation
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
 * Forge-specific type definitions
 */

import type { FlattenedRPCMap } from '${rpcMapImportPath}'

/**
 * Valid category values for forge nodes.
 * ${categories?.length ? `Configured categories: ${categories.join(', ')}` : 'No categories configured - forge cannot be used until forge.node.categories is defined in pikku.config.json.'}
 */
export type ForgeCategory = ${categoryType}

/**
 * Valid RPC names that can be used with forge nodes.
 * These are derived from the FlattenedRPCMap which includes both local and external package RPCs.
 */
export type ForgeRPCName = keyof FlattenedRPCMap
`
}
