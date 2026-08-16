export * from './errors.js'
export { PikkuError, addError } from './error-handler.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { ErrorDetails } from './error-handler.js'
export { isExpectedError } from './error-handler.js'
export type { SerializedError } from './serialized-error.js'
