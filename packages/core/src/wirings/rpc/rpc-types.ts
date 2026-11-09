import type { CredentialOverrides } from '../credential/credential-overrides.js'
import type { PikkuRawWire } from '../../types/core.types.js'
import type { AgentInterruptResult } from '../agent/agent-interrupt.js'

/** The `rpc` object on a function's wire. An app's generated types narrow `invoke`, `mesh`, `startWorkflow` and `agent` to its own functions, workflows and agents; see {@link PikkuRPCService} for how each call is routed. */
export type PikkuRPC<
  Invoke extends (...args: any[]) => any = (...args: any[]) => any,
  Mesh extends (...args: any[]) => any = (...args: any[]) => any,
  startWorkflow extends (...args: any[]) => any = (...args: any[]) => any,
  AgentRun extends (...args: any[]) => any = (...args: any[]) => any,
  AgentStream extends (...args: any[]) => any = (...args: any[]) => any,
> = {
  depth: number
  global: boolean
  /** The W3C trace of the invocation holding this `rpc`, if it is in one. */
  traceparent?: string
  invoke: Invoke
  mesh: Mesh
  exposed: (name: string, data: any) => Promise<any>
  /** Invoke an RPC with explicit wire fields merged over the caller's. */
  rpcWithWire: <In = any, Out = any>(
    rpcName: string,
    data: In,
    wire: PikkuRawWire
  ) => Promise<Out>
  startWorkflow: startWorkflow
  agent: PikkuAgentRPC<AgentRun, AgentStream>
  /**
   * The same calls as `agent`, for a request from outside (the generated agent
   * routes). Each answers a 404 unless the named agent is `expose: true`; who may
   * then call it is the agent's own `auth`, scopes and permissions. Mirrors
   * `exposed`; `agent` itself stays unchecked for application code.
   */
  exposedAgent: PikkuExposedAgentRPC
  /**
   * The calls behind the generated `/workflow/*` routes. Each answers a 404
   * unless the named workflow is `expose: true`, then applies the workflow's own
   * `auth`, scopes, permissions and run ownership. Mirrors `exposed`;
   * `startWorkflow` itself stays unchecked for application code.
   */
  exposedWorkflow: {
    start: (workflowName: string, data?: unknown) => Promise<{ runId: string }>
    /** Starts the run and waits for it to finish. */
    run: (workflowName: string, data?: unknown) => Promise<any>
    status: (workflowName: string, runId: string) => Promise<any>
    approve: (
      workflowName: string,
      runId: string,
      reason: string,
      decision: unknown
    ) => Promise<{ ok: true }>
    /** Step names and statuses, over the wire's channel. */
    streamStatus: (workflowName: string, runId: string) => Promise<void>
    /** As `streamStatus`, plus output, error and child run ids. */
    streamStatusFull: (workflowName: string, runId: string) => Promise<void>
  }
}

/** Generated metadata for one RPC name: the function it resolves to, whether `rpc.exposed` may call it, and whether it is reachable remotely. */
export type RPCMeta = {
  pikkuFuncId: string
  expose: boolean
  remote?: boolean
}

export interface RPCHandler<Input, Output> {
  input: Input
  output: Output
}

export interface ResolvedFunction {
  package: string
  function: string
  addonConfig: {
    package: string
    auth?: boolean
    tags?: string[]
    /** Set by the consuming app: which of the addon's declared-exposed functions `rpc.exposed` may call */
    expose?: boolean | string[]
    rpcEndpoint?: string
    secretOverrides?: Record<string, string>
    variableOverrides?: Record<string, string>
    credentialOverrides?: CredentialOverrides
    /** Set by the consuming app: secrets it lends this instance, as the addon names them */
    secretGrants?: string[]
    /** Set by the consuming app: credentials it lends this instance, as the addon names them */
    credentialGrants?: string[]
    /** Set by the consuming app: hand this instance the unscoped `SecretService` */
    globalSecrets?: string
    /** Set by the consuming app: hand this instance the unscoped `CredentialService` */
    globalCredentials?: string
    /** Set by the consuming app: the content folder this instance owns */
    contentBucket?: string
    /** Set by the consuming app: paths outside its folder this instance may read or write */
    contentGrants?: Record<string, 'read' | 'write'>
    /** Set by the consuming app: hand this instance the unscoped `ContentService` */
    globalContent?: string
    /** Set by `wireRemoteAddon`: dispatch this namespace's RPCs over HTTP */
    remote?: boolean
    serverUrl?: string | ((services: any) => string | Promise<string>)
    remoteAuth?:
      | { credentialId: string }
      | { secretId: string }
      | {
          resolve: (
            services: any,
            wire: any
          ) => string | null | Promise<string | null>
        }
    /** Maps the base fn name; a versioned call appends `@vN` after it. */
    remoteName?: (fn: string) => string
    remoteTimeoutMs?: number
    remoteHeaders?: (
      services: any,
      wire: any
    ) => Record<string, string> | Promise<Record<string, string>>
  }
}

/** The calls of `rpc.agent`. */
export type PikkuAgentRPC<
  AgentRun extends (...args: any[]) => any = (...args: any[]) => any,
  AgentStream extends (...args: any[]) => any = (...args: any[]) => any,
> = {
  run: AgentRun
  stream: AgentStream
  resume: (
    runId: string,
    input: { toolCallId: string; approved: boolean },
    options?: any
  ) => Promise<void>
  approve: (
    runId: string,
    approvals: { toolCallId: string; approved: boolean }[]
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

/**
 * `rpc.exposedAgent`: the calls of `rpc.agent` for a request from outside. A
 * resume or approve names the agent its route was built for, and a run that
 * belongs to another agent is refused there, not in the callee.
 */
export type PikkuExposedAgentRPC = Omit<PikkuAgentRPC, 'resume' | 'approve'> & {
  resume: (
    runId: string,
    input: {
      toolCallId: string
      approved: boolean
      expectedAgentName?: string
    },
    options?: any
  ) => Promise<void>
  approve: (
    runId: string,
    approvals: { toolCallId: string; approved: boolean }[],
    expectedAgentName?: string
  ) => Promise<any>
}
