export type PikkuRPC<
  Invoke extends Function = any,
  Remote extends Function = any,
  startWorkflow extends Function = any,
  Agent extends Function = any,
> = {
  depth: number
  global: boolean
  invoke: Invoke
  remote: Remote
  exposed: (name: string, data: any) => Promise<any>
  startWorkflow: startWorkflow
  agent: Agent
}

export type RPCMeta = {
  pikkuFuncId: string
  expose: boolean
  remote?: boolean
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
  namespace: string
  package: string
  function: string
}
