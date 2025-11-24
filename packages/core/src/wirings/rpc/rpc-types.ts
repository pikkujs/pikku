export type PikkuRPC<invoke extends Function = any> = {
  depth: number
  global: boolean
  invoke: invoke
}

export type RPCMeta = {
  pikkuFuncName: string
  expose: boolean
  internal?: boolean
}

/**
 * Type for RPC handlers
 */
export interface RPCHandler<Input, Output> {
  input: Input
  output: Output
}

/**
 * Resolved function reference from namespace
 */
export interface ResolvedFunction {
  package: string
  function: string
}
