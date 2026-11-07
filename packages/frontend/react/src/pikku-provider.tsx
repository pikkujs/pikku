import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type {
  CorePikkuFetch,
  PikkuAgentApproveInput,
  PikkuAgentEvent,
  PikkuAgentInput,
  PikkuAgentRunResult,
  PikkuAgentStreamOptions,
} from '@pikku/fetch'
import type { AnalyticsClient } from './analytics.js'
import type { FeatureFlagClient } from './feature-flags.js'

export type PikkuInstance<
  Fetch extends CorePikkuFetch = CorePikkuFetch,
  RPC = any,
  Realtime = any,
> = {
  fetch: Fetch
  rpc: RPC
  /** Optional — present when createPikku is called with a PikkuRealtime class. */
  realtime?: Realtime
  /** Optional — a `createAnalytics` client, so components reach it through the provider. */
  analytics?: AnalyticsClient<any>
  /** Optional — a `createFeatureFlags` client, so components reach it through the provider. */
  featureFlags?: FeatureFlagClient<any>
}

const PikkuContext = createContext<PikkuInstance | null>(null)

export const PikkuProvider = ({
  pikku,
  children,
}: {
  pikku: PikkuInstance
  children: ReactNode
}) => {
  return <PikkuContext.Provider value={pikku}>{children}</PikkuContext.Provider>
}

export const usePikkuFetch = <
  Fetch extends CorePikkuFetch = CorePikkuFetch,
>(): Fetch => {
  const context = useContext(PikkuContext)
  if (!context) {
    throw new Error('usePikkuFetch must be used within PikkuProvider')
  }
  return context.fetch as Fetch
}

export const usePikkuAnalytics = <
  TEvent extends { name: string },
>(): AnalyticsClient<TEvent> => {
  const context = useContext(PikkuContext)
  if (!context) {
    throw new Error('usePikkuAnalytics must be used within PikkuProvider')
  }
  if (!context.analytics) {
    throw new Error(
      'usePikkuAnalytics needs an analytics client on the Pikku instance'
    )
  }
  return context.analytics as AnalyticsClient<TEvent>
}

export const usePikkuRPC = <RPC = any,>(): RPC => {
  const context = useContext(PikkuContext)
  if (!context) {
    throw new Error('usePikkuRPC must be used within PikkuProvider')
  }
  return context.rpc as RPC
}

type AgentRPC = {
  agent: {
    run: (
      agentName: string,
      input: PikkuAgentInput
    ) => Promise<PikkuAgentRunResult>
    stream: (
      agentName: string,
      input: PikkuAgentInput,
      options?: PikkuAgentStreamOptions
    ) => AsyncGenerator<PikkuAgentEvent, void, undefined>
    approve: (
      agentName: string,
      input: PikkuAgentApproveInput
    ) => Promise<PikkuAgentRunResult>
  }
}

/**
 * The app's agents, by export name, with each one's output. Empty here: the generated
 * React Query file (`clientFiles.reactQueryFile`) fills it in, which is what makes
 * `usePikkuAgent` refuse a name that is not an agent and type each agent's `result`.
 */
export interface PikkuAgentRegistry {}

type RegisteredAgents = PikkuAgentRegistry extends { agents: infer Agents }
  ? Agents
  : Record<string, unknown>

/** An agent's export name, as the app's generated types know them. */
export type PikkuAgentName = keyof RegisteredAgents & string

/** What `usePikkuAgent` hands back for one agent. */
export type PikkuAgent<Output = unknown> = {
  run: (input: PikkuAgentInput) => Promise<PikkuAgentRunResult<Output>>
  stream: (
    input: PikkuAgentInput,
    options?: PikkuAgentStreamOptions
  ) => AsyncGenerator<PikkuAgentEvent, void, undefined>
  approve: (
    input: PikkuAgentApproveInput
  ) => Promise<PikkuAgentRunResult<Output>>
}

type WorkflowRPC = {
  startWorkflow: (workflowName: string, input: any) => Promise<any>
  runWorkflow: (workflowName: string, input: any) => Promise<any>
  workflowStatus: (workflowName: string, runId: string) => Promise<any>
}

/**
 * Runs an agent from a screen. `agentName` is the agent's export, not its `name`
 * field; with the generated React Query file in the app, any other name is a type
 * error. `stream(input, { signal? })` is an async iterable of the run's AG-UI
 * events: read it with `for await`. `TEXT_MESSAGE_CONTENT` carries the reply as
 * `delta`s, a `CUSTOM` event named `pikku:approval-request` asks for an approval
 * (`value` has `runId`, `toolCallId`, `toolName`, `args`, `reason`) and is
 * followed by the end of that stream, and `RUN_FINISHED` is the last event, with
 * `usage`. A `RUN_ERROR` from the server throws a `PikkuAgentStreamError`, and
 * aborting `signal` ends the request. `run(input)` waits for the whole reply and
 * resolves to `{ runId, result, usage }`; when a tool with `approvalRequired` is
 * reached it resolves with `status: 'suspended'` and `pendingApprovals` instead.
 * `approve({ runId, approvals: [{ toolCallId, approved }] })` answers either kind
 * of request, carries the run on, and resolves like `run`. Memory: send the same
 * `threadId` every turn and the agent reads that thread's last 20 stored messages
 * (`memory.lastMessages`), so make one id per conversation and keep it (state, URL
 * or localStorage) to continue it on a later visit. This needs the `agentStorage`
 * service and a signed-in user: signed out, each call gets a new owner and the
 * second turn is refused. `resourceId` is any stable label; the server files it
 * under the session's user. To show earlier messages,
 * `usePikkuQuery('getAgentThreadMessages', { threadId })` returns the stored
 * `AgentMessage[]` in order: render `role` `'user'` and `'assistant'` and their
 * `content`, a string or `{ type: 'text', text }` parts. It refuses a thread with
 * no turns yet, so enable it after the first reply. `getAgentThreads` lists the
 * user's threads and `deleteAgentThread` removes one; all three come with
 * `scaffold.agent` in pikku.config.json.
 *
 * @example
 * const agent = usePikkuAgent('helpAgent')
 * // the conversation's id, kept once it has a turn so a later visit continues it
 * const [threadId, setThreadId] = useState(() => localStorage.getItem('helpThread'))
 * const history = usePikkuQuery('getAgentThreadMessages', { threadId: threadId ?? '' }, {
 *   enabled: !!threadId,
 * })
 * const [live, setLive] = useState('')
 *
 * const send = async (message: string) => {
 *   const id = threadId ?? crypto.randomUUID()
 *   for await (const event of agent.stream({ message, threadId: id, resourceId: 'help' })) {
 *     if (event.type === 'TEXT_MESSAGE_CONTENT') setLive((text) => text + event.delta)
 *     if (event.type === 'CUSTOM' && event.name === 'pikku:approval-request') {
 *       const { runId, toolCallId } = event.value
 *       // the stream ends here; the resumed run's reply comes back from approve
 *       const resumed = await agent.approve({ runId, approvals: [{ toolCallId, approved: true }] })
 *       setLive((text) => text + String(resumed.result))
 *     }
 *   }
 *   localStorage.setItem('helpThread', id)
 *   setThreadId(id)
 *   setLive('')
 *   await history.refetch()
 * }
 *
 * // or, without streaming
 * const reply = await agent.run({ message, threadId: id, resourceId: 'help' })
 * if (reply.status === 'suspended') {
 *   const { runId, toolCallId } = reply.pendingApprovals[0]
 *   await agent.approve({ runId, approvals: [{ toolCallId, approved: true }] })
 * }
 */
export const usePikkuAgent = <Name extends PikkuAgentName>(
  agentName: Name
): PikkuAgent<RegisteredAgents[Name]> => {
  const rpc = usePikkuRPC<AgentRPC>()

  return {
    run: (input) =>
      rpc.agent.run(agentName, input) as Promise<
        PikkuAgentRunResult<RegisteredAgents[Name]>
      >,
    stream: (input, options) => rpc.agent.stream(agentName, input, options),
    approve: (input) =>
      rpc.agent.approve(agentName, input) as Promise<
        PikkuAgentRunResult<RegisteredAgents[Name]>
      >,
  }
}

export const usePikkuWorkflow = <
  RPC extends WorkflowRPC = WorkflowRPC,
  Name extends string = string,
>(
  workflowName: Name
) => {
  const rpc = usePikkuRPC<RPC>()

  return {
    start: (input: Parameters<RPC['startWorkflow']>[1]) =>
      rpc.startWorkflow(workflowName, input),
    run: (input: Parameters<RPC['runWorkflow']>[1]) =>
      rpc.runWorkflow(workflowName, input),
    status: (runId: Parameters<RPC['workflowStatus']>[1]) =>
      rpc.workflowStatus(workflowName, runId),
  }
}

/**
 * Returns the realtime client wired by `createPikku(...)`. Throws if the
 * provider wasn't given a realtime instance — pass the `PikkuRealtime`
 * class as the third argument to `createPikku` when constructing the
 * instance.
 */
export const usePikkuRealtime = <Realtime = any,>(): Realtime => {
  const context = useContext(PikkuContext)
  if (!context) {
    throw new Error('usePikkuRealtime must be used within PikkuProvider')
  }
  if (!context.realtime) {
    throw new Error(
      'usePikkuRealtime: no realtime client on PikkuInstance. Pass PikkuRealtime as the third argument to createPikku(...).'
    )
  }
  return context.realtime as Realtime
}

export const usePikkuFeatureFlags = <
  Name extends string = string,
>(): FeatureFlagClient<Name> => {
  const context = useContext(PikkuContext)
  if (!context) {
    throw new Error('usePikkuFeatureFlags must be used within PikkuProvider')
  }
  if (!context.featureFlags) {
    throw new Error(
      'usePikkuFeatureFlags needs a feature flag client on the Pikku instance'
    )
  }
  return context.featureFlags as FeatureFlagClient<Name>
}

/**
 * Whether to render one feature, re-rendering when the map arrives or changes.
 *
 * `useSyncExternalStore` rather than state and an effect: the client is shared
 * by every component that asks, and this is what keeps them from tearing — half
 * the tree on the bootstrapped map and half on the fetched one.
 *
 * Advisory. It answers what to show, never what is allowed; the server
 * re-checks availability on the call itself.
 */
export const useFeatureFlag = <Name extends string = string>(
  name: Name
): boolean => {
  const flags = usePikkuFeatureFlags<Name>()
  return useSyncExternalStore(
    flags.subscribe,
    () => flags.has(name),
    // The server render is the bootstrapped value, which is the whole point of
    // bootstrapping: hydrate onto the same answer rather than flipping on mount.
    () => flags.has(name)
  )
}
