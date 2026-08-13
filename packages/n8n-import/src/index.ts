export { parseN8n, UnsupportedTopologyError } from './parse-n8n.js'
export { generateWorkflowFromN8n } from './codegen.js'

/**
 * Naming helpers. Engine-agnostic — a second importer that normalizes onto this
 * IR needs the identical identifier/rpc-name rules, so both can emit into one
 * project without colliding. First piece of the shared core; see
 * `@pikku/make-import`.
 */
export {
  dedupe,
  toCamelCase,
  toKebabCase,
} from './naming.js'

export type {
  ParsedWorkflow,
} from './types.js'
export type { Topology } from './topology.js'
export type {
  ClassifiedExpression,
  ExprContext,
} from './expressions.js'
export type { GenerateResult } from './codegen.js'
