import type {
  GraphNodeConfig,
  NextConfig,
  RefValue,
} from './workflow-graph.types.js'

export interface RPCHandler<I = any, O = any> {
  input: I
  output: O
}

type ComputeNodeOutputs<
  FuncMap extends Record<string, string>,
  RPCMap extends Record<string, RPCHandler>,
> = {
  [K in keyof FuncMap]: FuncMap[K] extends keyof RPCMap
    ? RPCMap[FuncMap[K]]['output']
    : unknown
}

type ComputeNodeInputs<
  FuncMap extends Record<string, string>,
  RPCMap extends Record<string, RPCHandler>,
> = {
  [K in keyof FuncMap]: FuncMap[K] extends keyof RPCMap
    ? RPCMap[FuncMap[K]]['input']
    : unknown
}

export type TypedRef<T> = RefValue & { __phantomType?: T }

type InputWithRefs<T> = {
  [K in keyof T]: T[K] | TypedRef<T[K]>
}

export function createGraph<RPCMap extends Record<string, RPCHandler>>() {
  return <const FuncMap extends Record<string, keyof RPCMap & string>>(
    funcMap: FuncMap,
    nodesOrBuilder?:
      | GraphNodeConfigMap<FuncMap, RPCMap>
      | ((nodes: FuncMap) => GraphNodeConfigMap<FuncMap, RPCMap>)
  ): Record<
    Extract<keyof FuncMap, string>,
    GraphNodeConfig<Extract<keyof FuncMap, string>>
  > => {
    type NodeIds = Extract<keyof FuncMap, string>

    if (!nodesOrBuilder) {
      const result: Record<string, GraphNodeConfig<string>> = {}
      for (const [nodeId, rpcName] of Object.entries(funcMap)) {
        result[nodeId] = {
          func: rpcName as string,
        }
      }
      return result as Record<NodeIds, GraphNodeConfig<NodeIds>>
    }

    const nodes =
      typeof nodesOrBuilder === 'function'
        ? nodesOrBuilder(funcMap)
        : nodesOrBuilder

    const result: Record<string, GraphNodeConfig<string>> = {}

    for (const [nodeId, def] of Object.entries(nodes) as [string, any][]) {
      result[nodeId] = {
        func: funcMap[nodeId] as string,
        input: def?.input as any,
        next: def?.next,
        onError: def?.onError,
        retries: def?.retries,
        retryDelay: def?.retryDelay,
      }
    }

    return result as Record<NodeIds, GraphNodeConfig<NodeIds>>
  }
}

type GraphNodeConfigMap<
  FuncMap extends Record<string, string>,
  RPCMap extends Record<string, RPCHandler>,
> = {
  [K in Extract<keyof FuncMap, string>]?: {
    next?: NextConfig<Extract<keyof FuncMap, string>>
    input?: (
      ref: <
        N extends Extract<keyof FuncMap, string>,
        P extends keyof ComputeNodeOutputs<FuncMap, RPCMap>[N] & string,
      >(
        nodeId: N,
        path: P
      ) => TypedRef<ComputeNodeOutputs<FuncMap, RPCMap>[N][P]>
    ) => InputWithRefs<ComputeNodeInputs<FuncMap, RPCMap>[K]>
    onError?: Extract<keyof FuncMap, string> | Extract<keyof FuncMap, string>[]
    retries?: number
    retryDelay?: string | number
    notes?: string
  }
}
