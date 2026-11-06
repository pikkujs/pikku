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
  /**
   * Optional — a `createAnalytics` client. `createPikku` does not make one: add
   * it to what `createPikku` returned before handing that to `PikkuProvider`, or
   * `usePikkuAnalytics` throws.
   */
  analytics?: AnalyticsClient<any>
  /**
   * Optional — a `createFeatureFlags` client. `createPikku` does not make one:
   * add it to what `createPikku` returned before handing that to
   * `PikkuProvider`, or `useFeatureFlag` and `usePikkuFeatureFlags` throw.
   */
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

/**
 * The product-analytics client from the provider. `.event(name, props)` buffers
 * one declared event for `POST /analytics`; nothing identifying goes in the
 * props, since the ingest stamps who it was from the session. For an outcome the
 * server already knows, record it in the function with `analytics.record` rather
 * than from a screen: a beacon can be blocked, a function cannot.
 *
 * Throws unless the instance given to `PikkuProvider` has an `analytics` client,
 * which `createPikku` does not make. Pass the app's `AnalyticsEvent` as the type
 * argument so a misspelt event is a build error.
 *
 * @example
 * const analytics = usePikkuAnalytics<AnalyticsEvent>()
 * analytics.event('signed_up', {})
 */
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
 * `name` field. Returns `run`, `stream` and `approve`, already typed and already
 * carrying the provider's client.
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

/**
 * The whole flag client from the provider, for `all()`, `ready` and `refresh()`.
 * To read one flag use `useFeatureFlag`. The map is fetched once, so call
 * `refresh()` when the session changes: a flag turned off reaches a page that
 * is already open only then, or on its next load. The server gate is immediate.
 *
 * Throws unless the instance given to `PikkuProvider` has a `featureFlags`
 * client, which `createPikku` does not make.
 */
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
 * re-checks availability on the call itself, so put `featureFlag` on the
 * function too. Throws unless the instance given to `PikkuProvider` has a
 * `featureFlags` client, which `createPikku` does not make. Pass the app's
 * `FeatureFlagName` as the type argument so a misspelt flag is a build error.
 *
 * @example
 * const showExport = useFeatureFlag<FeatureFlagName>('orderExport')
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
