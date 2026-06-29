export type PikkuRPC<
  Invoke extends Function = Function,
  Remote extends Function = Function,
  startWorkflow extends Function = Function,
  AgentRun extends Function = Function,
  AgentStream extends Function = Function,
> = {
  depth: number
  global: boolean
  invoke: Invoke
  remote: Remote
  exposed: (name: string, data: any) => Promise<any>
  startWorkflow: startWorkflow
  agent: {
    run: AgentRun
    stream: AgentStream
    resume: (
      runId: string,
      input: { toolCallId: string; approved: boolean },
      options?: any
    ) => Promise<void>
    approve: (
      runId: string,
      approvals: { toolCallId: string; approved: boolean }[],
      expectedAgentName?: string
    ) => Promise<any>
  }
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
  package: string
  function: string
  addonConfig: {
    package: string
    auth?: boolean
    tags?: string[]
    rpcEndpoint?: string
  }
}
