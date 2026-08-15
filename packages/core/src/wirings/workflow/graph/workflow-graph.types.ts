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

export interface GraphNodeConfig<NodeIds extends string = string> {
  func: string
  input?: (ref: RefFn<NodeIds>) => Record<string, unknown>
  next?: NextConfig<NodeIds>
  onError?: NodeIds | NodeIds[]
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
}

export interface GraphWireState {
  branchKey?: string
}
