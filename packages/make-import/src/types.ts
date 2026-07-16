/**
 * Make (Integromat) blueprint types — the subset we read.
 *
 * Format reference: https://github.com/integromat/make-skills (MIT), specifically
 * `skills/make-scenario-building/blueprint-construction.md`. Make publishes the
 * blueprint format itself, so this mirrors documented structure rather than
 * reverse-engineered shape.
 */

/** One `{a, b, o}` condition inside a filter's OR/AND matrix. */
export interface MakeCondition {
  /** Left operand — usually an IML ref (`{{1.status}}`). */
  a?: string
  /** Right operand — absent for `exist` / `notexist`. */
  b?: string
  /** Operator: `text:equal`, `text:equal:ci`, `number:greater`, `exist`, … */
  o?: string
}

/**
 * A Make filter. `conditions` is a nested matrix: the OUTER array is OR groups,
 * the INNER array is ANDed conditions within a group.
 */
export interface MakeFilter {
  name?: string
  conditions?: MakeCondition[][]
}

/** A router route — just a nested flow. Its head module carries the gate `filter`. */
export interface MakeRoute {
  flow?: MakeModule[]
}

/** An if/else branch (`builtin:BasicIfElse`). Unlike routes, these are exclusive. */
export interface MakeBranch {
  /** `condition` carries `conditions`; `else` is the fallback. */
  type?: 'condition' | 'else'
  conditions?: MakeCondition[][]
  /** `true` when the branch converges back through the paired BasicMerge. */
  merge?: boolean
  flow?: MakeModule[]
}

export interface MakeModule {
  /** Unique positive integer. IML refs address modules by this id. */
  id: number
  /** `namespace:ModuleName`, e.g. `google-sheets:watchRows`, `builtin:BasicRouter`. */
  module: string
  version?: number
  /** Fixed config (connection, selected account). Also carries aggregator `feeder`. */
  parameters?: Record<string, unknown>
  /** Dynamic field mappings — IML expressions. This is the input map. */
  mapper?: Record<string, unknown>
  /** Gate on this module. Present on route heads; legal on ANY module. */
  filter?: MakeFilter | null
  metadata?: {
    designer?: { x?: number; y?: number; name?: string }
    parameters?: Array<{ name?: string; type?: string; label?: string }>
  }
  /** Router only — non-exclusive, cannot merge back. */
  routes?: MakeRoute[]
  /** BasicIfElse only — exclusive, merges via the paired BasicMerge. */
  branches?: MakeBranch[]
  /** Nested error-handler flow. */
  onerror?: MakeModule[]
}

export interface MakeBlueprint {
  name?: string
  flow?: MakeModule[]
  metadata?: Record<string, unknown>
}

/**
 * The full export envelope. The Make API (and every template file) nests the
 * blueprint under `blueprint`; some hand-saved files are the bare blueprint.
 */
export interface MakeExport {
  blueprint?: MakeBlueprint
  controller?: Record<string, unknown>
  scheduling?: Record<string, unknown>
  metadata?: Record<string, unknown>
  /** Present when the file IS the bare blueprint. */
  flow?: MakeModule[]
  name?: string
}

/** Split `google-sheets:watchRows` → `{ app: 'google-sheets', operation: 'watchRows' }`. */
export function splitModule(module: string): { app: string; operation: string } {
  const i = module.indexOf(':')
  if (i < 0) return { app: module, operation: '' }
  return { app: module.slice(0, i), operation: module.slice(i + 1) }
}

/** Make namespaces that are engine primitives rather than third-party integrations. */
export const BUILTIN_NAMESPACES = new Set([
  'builtin',
  'util',
  'json',
  'regexp',
  'gateway',
  'http',
  'datastore',
  'markdown',
  'csv',
  'xml',
  'archive',
  'image',
  'text',
  'math',
  'date',
  'tools',
  'code',
  'scenario-service',
  'placeholder',
])

/** Make module ids that start a scenario (their output is the graph's `trigger`). */
export const TRIGGER_OPERATIONS = /^(watch|trigger|on|new|get.*trigger)/i
