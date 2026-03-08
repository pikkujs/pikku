import type { FunctionMeta, FunctionsMeta } from '@pikku/core'

/**
 * Look up function metadata by pikkuFuncId, checking both local functions
 * and addon functions. Addon functions use namespaced IDs like 'namespace:funcName'.
 */
export function resolveFunctionMeta(
  state: {
    functions: { meta: FunctionsMeta }
    addonFunctions: Record<string, FunctionsMeta>
  },
  pikkuFuncId: string
): FunctionMeta | undefined {
  // Check local functions first
  const local = state.functions.meta[pikkuFuncId]
  if (local) return local

  // Check addon functions (namespaced like 'swaggerPetstore:addPet')
  const colonIndex = pikkuFuncId.indexOf(':')
  if (colonIndex === -1) return undefined

  const namespace = pikkuFuncId.substring(0, colonIndex)
  const funcName = pikkuFuncId.substring(colonIndex + 1)
  return state.addonFunctions[namespace]?.[funcName]
}
