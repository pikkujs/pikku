export type PikkuRPC<invoke extends Function = any> = {
  depth: number
  global: boolean
  invoke: invoke
}

export type RPCMeta = {
  pikkuFuncName: string
  exposed: boolean
}

/**
 * Type for RPC handlers
 */
export interface RPCHandler<Input, Output> {
  input: Input
  output: Output
}
