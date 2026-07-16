export { parseN8n, UnsupportedTopologyError } from './parse-n8n.js'
export { buildTopology } from './topology.js'
export { classifyExpression } from './expressions.js'
export { generateWorkflowFromN8n } from './codegen.js'

/**
 * Naming helpers. Engine-agnostic — a second importer that normalizes onto this
 * IR needs the identical identifier/rpc-name rules, so both can emit into one
 * project without colliding. First piece of the shared core; see
 * `@pikku/make-import`.
 */
export {
  sanitizeIdentifier,
  sanitizeDisplayName,
  dedupe,
  integrationRpcName,
  codeRpcName,
  toCamelCase,
  toPascalCase,
  toKebabCase,
} from './naming.js'

export type {
  N8nWorkflow,
  N8nNode,
  N8nConnections,
  ParsedWorkflow,
  ParsedNode,
  NodeRole,
  WorkflowShape,
} from './types.js'
export type { NextValue, Topology, NodeTopology } from './topology.js'
export type {
  ClassifiedExpression,
  ExprContext,
  RefPart,
} from './expressions.js'
export type { GenerateResult, ManifestEntry } from './codegen.js'
