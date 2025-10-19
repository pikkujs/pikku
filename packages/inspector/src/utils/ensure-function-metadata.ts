import { InspectorState } from '../types.js'

/**
 * Ensures that function metadata exists for a given pikkuFuncName.
 * Creates stub metadata if it doesn't exist (useful for inline functions).
 */
export function ensureFunctionMetadata(
  state: InspectorState,
  pikkuFuncName: string,
  fallbackName?: string
): void {
  if (!state.functions.meta[pikkuFuncName]) {
    state.functions.meta[pikkuFuncName] = {
      pikkuFuncName,
      name: fallbackName || pikkuFuncName,
      services: { optimized: false, services: [] },
      inputSchemaName: null,
      outputSchemaName: null,
      inputs: [],
      outputs: [],
      middleware: undefined,
    }
  }
}
