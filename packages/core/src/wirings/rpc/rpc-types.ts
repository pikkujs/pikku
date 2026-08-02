import type { AgentInterruptResult } from '../ai-agent/ai-agent-interrupt.js'

export type PikkuRPC<
  Invoke extends (...args: any[]) => any = (...args: any[]) => any,
  Remote extends (...args: any[]) => any = (...args: any[]) => any,
  startWorkflow extends (...args: any[]) => any = (...args: any[]) => any,
  AgentRun extends (...args: any[]) => any = (...args: any[]) => any,
  AgentStream extends (...args: any[]) => any = (...args: any[]) => any,
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
    /** Stop an in-flight run. Needs no channel — it ends a stream rather than
     *  continuing one — so it is reachable over a plain RPC while the stream
     *  itself is held open elsewhere. Resolves `stopped: false` when there was
     *  nothing left to stop, and names any tools still executing — their side
     *  effects have already happened and are not undone by interrupting. */
    interrupt: (
      runId: string,
      reason?: 'speech' | 'user' | 'timeout'
    ) => Promise<AgentInterruptResult>
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
    secretOverrides?: Record<string, string>
    variableOverrides?: Record<string, string>
    credentialOverrides?: Record<string, string>
    /** Set by `wireRemoteAddon`: dispatch this namespace's RPCs over HTTP */
    remote?: boolean
    serverUrl?: string | ((services: any) => string | Promise<string>)
    remoteAuth?:
      | { credentialId: string }
      | { secretId: string }
      | { resolve: (services: any, wire: any) => string | Promise<string> }
    remoteName?: (fn: string) => string
  }
}
