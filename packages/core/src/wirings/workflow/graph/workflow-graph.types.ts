import type { TemplateString } from './template.js'

export interface RefValue {
  __isRef: true
  nodeId: string
  path?: string
}

export const createRef = (nodeId: string, path?: string): RefValue => ({
  __isRef: true,
  nodeId,
  path,
})

export const isRef = (value: unknown): value is RefValue =>
  typeof value === 'object' &&
  value !== null &&
  '__isRef' in value &&
  (value as RefValue).__isRef === true

export type RefFn<NodeIds extends string = string> = (
  nodeId: NodeIds,
  path?: string
) => RefValue

export type NextConfig<NodeIds extends string = string> =
  NodeIds | NodeIds[] | Record<string, NodeIds | NodeIds[]>

export type TemplateFn = (
  templateStr: string,
  refs: Array<{ $ref: string; path?: string }>
) => TemplateString

export type ItemFn = (path?: string) => RefValue

export type ForEachConfig<NodeIds extends string = string> =
  NodeIds | RefValue | ((ref: RefFn<NodeIds>) => RefValue)

export type ForEachMode = 'parallel' | 'sequential'

export interface GraphNodeConfig<NodeIds extends string = string> {
  func: string
  /**
   * Run this node once per element of an upstream array. The node's own result
   * becomes the ordered array of per-item results.
   */
  forEach?: ForEachConfig<NodeIds>
  /** How the per-item instances of a `forEach` node run. Defaults to 'parallel'. */
  mode?: ForEachMode
  input?: (
    ref: RefFn<NodeIds>,
    template: TemplateFn,
    $item: ItemFn
  ) => Record<string, unknown>
  next?: NextConfig<NodeIds>
  /**
   * What happens when this node fails after its retries: run these nodes
   * instead (the error is on `graph.recoveringFrom`), or `'ignore'` to carry
   * on to `next` with a null output. A recovered failure is not compensated.
   */
  recover?: NodeIds | NodeIds[] | 'ignore'
  /** Leave this node out of the saga unwind. */
  compensate?: false
  retries?: number
  retryDelay?: string | number
  notes?: string
}

export interface PikkuGraphWire {
  runId: string
  graphName: string
  nodeId: string
  branch: (key: string) => void
  setState: (name: string, value: unknown) => Promise<void>
  getState: () => Promise<Record<string, unknown>>
  /** Set on a node that runs because another node failed and named it in `recover`. */
  recoveringFrom?: GraphRecovery
}

export interface GraphRecovery {
  nodeId: string
  stepName: string
  error: { message: string; stack?: string; code?: string; name?: string }
}

export interface GraphWireState {
  branchKey?: string
}
