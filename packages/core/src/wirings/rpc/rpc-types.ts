export type PikkuRPC<
  Invoke extends Function = any,
  Remote extends Function = any,
  startWorkflow extends Function = any,
> = {
  depth: number
  global: boolean
  invoke: Invoke
  remote: Remote
  exposed: (name: string, data: any) => Promise<any>
  startWorkflow: startWorkflow
  agent: {
    run: (
      agentName: string,
      input: any
    ) => Promise<{
      runId: string
      result: unknown
      usage: { inputTokens: number; outputTokens: number }
    }>
    stream: (agentName: string, input: any, options?: any) => Promise<void>
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
  namespace: string
  package: string
  function: string
}
