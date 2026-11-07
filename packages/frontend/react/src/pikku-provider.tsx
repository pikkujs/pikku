import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { CorePikkuFetch } from '@pikku/fetch'
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
    run: (agentName: string, input: any) => Promise<any>
    stream: (agentName: string, input: any) => Promise<any>
    approve: (agentName: string, input: any) => Promise<any>
  }
}

type WorkflowRPC = {
  startWorkflow: (workflowName: string, input: any) => Promise<any>
  runWorkflow: (workflowName: string, input: any) => Promise<any>
  workflowStatus: (workflowName: string, runId: string) => Promise<any>
}

/**
 * Runs an agent from a screen. `agentName` is the agent's export, not its
 * `name` field. `run({ message, threadId, resourceId })` answers `{ runId,
 * result, usage }`; when a tool with `approvalRequired` is reached it also
 * carries `status: 'suspended'` and `pendingApprovals` (`toolCallId`,
 * `toolName`, `args`, `runId`), and `approve({ runId, approvals: [{ toolCallId,
 * approved }] })` carries on and answers the same shape. Results are untyped
 * (`any`). Memory: send the same `threadId` every turn and the agent reads that
 * thread's last 20 stored messages (`memory.lastMessages`), so make one id per
 * conversation and keep it (state, URL or localStorage) to continue it on a
 * later visit. This needs the `agentStorage` service and a signed-in user:
 * signed out, each call gets a new owner and the second turn is refused.
 * `resourceId` is any stable label; the server files it under the session's
 * user. To show earlier messages, `usePikkuQuery('getAgentThreadMessages', {
 * threadId })` returns the stored `AgentMessage[]` in order: render `role`
 * `'user'` and `'assistant'` and their `content`, a string or `{ type: 'text',
 * text }` parts. It refuses a thread with no turns yet, so enable it after the
 * first reply. `getAgentThreads` lists the user's threads and
 * `deleteAgentThread` removes one; all three come with `scaffold.agent` in
 * pikku.config.json. `stream` hands back nothing: it resolves once the run
 * ends. To show the reply as it arrives, POST with
 * `usePikkuFetch().fetch('/rpc/agent/:agentName/stream', 'POST', { agentName,
 * message, threadId, resourceId })` and read the response body's `data: <json>`
 * lines, which are AG-UI events: `TEXT_MESSAGE_CONTENT` carries a `delta` of
 * text, a `CUSTOM` named `pikku:approval-request` carries a pending approval
 * (answer it with `approve`), and `RUN_FINISHED` or `RUN_ERROR` ends it.
 *
 * @example
 * const agent = usePikkuAgent('helpAgent')
 * const pikkuFetch = usePikkuFetch()
 * // the conversation's id, kept once it has a turn so a later visit continues it
 * const [threadId, setThreadId] = useState(() => localStorage.getItem('helpThread'))
 * const history = usePikkuQuery('getAgentThreadMessages', { threadId: threadId! }, { enabled: !!threadId })
 * // history.data: [{ id, role: 'user' | 'assistant' | 'tool' | 'system', content, createdAt }]
 * const [live, setLive] = useState('')
 *
 * const send = async (message: string) => {
 *   const id = threadId ?? crypto.randomUUID()
 *   const response = await pikkuFetch.fetch('/rpc/agent/:agentName/stream', 'POST', {
 *     agentName: 'helpAgent', message, threadId: id, resourceId: 'help',
 *   })
 *   const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
 *   let buffer = ''
 *   for (;;) {
 *     const { done, value } = await reader.read()
 *     if (done) break
 *     buffer += value
 *     const frames = buffer.split('\n\n')
 *     buffer = frames.pop()!
 *     for (const frame of frames) {
 *       const event = JSON.parse(frame.replace(/^data: /, ''))
 *       if (event.type === 'TEXT_MESSAGE_CONTENT') setLive((text) => text + event.delta)
 *       if (event.type === 'CUSTOM' && event.name === 'pikku:approval-request') {
 *         const { runId, toolCallId } = event.value
 *         await agent.approve({ runId, approvals: [{ toolCallId, approved: true }] })
 *       }
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
export const usePikkuAgent = <
  RPC extends AgentRPC = AgentRPC,
  Name extends string = string,
>(
  agentName: Name
) => {
  const rpc = usePikkuRPC<RPC>()

  return {
    run: (input: Parameters<RPC['agent']['run']>[1]) =>
      rpc.agent.run(agentName, input),
    stream: (input: Parameters<RPC['agent']['stream']>[1]) =>
      rpc.agent.stream(agentName, input),
    approve: (input: Parameters<RPC['agent']['approve']>[1]) =>
      rpc.agent.approve(agentName, input),
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
