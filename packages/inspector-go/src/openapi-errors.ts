import { pikkuState } from '@pikku/core/state'
import type { InspectorGoAnalysisOptions } from './protocol.js'

/** One entry of @pikku/core's error registry, as the Go OpenAPI step reads it. */
export interface InspectorGoOpenAPIError {
  name: string
  status: number
  message: string
}

/**
 * The error registry the TypeScript finalize hands `generateOpenAPISpec`
 * (`pikkuState(null, 'misc', 'errors')`), flattened to plain data: it is keyed
 * by error class, which only this process has.
 */
export const openAPIErrors = (): InspectorGoOpenAPIError[] =>
  Array.from(pikkuState(null, 'misc', 'errors').entries()).map(
    ([error, details]) => ({
      name: error.name,
      status: details.status,
      message: details.message,
    })
  )

/** Adds the error registry to `options.openAPI`, when OpenAPI is wanted. */
export const withOpenAPIErrors = (
  options: InspectorGoAnalysisOptions
): InspectorGoAnalysisOptions => {
  if (!options.openAPI) return options
  const openAPI = { ...options.openAPI, errors: openAPIErrors() }
  return { ...options, openAPI }
}
