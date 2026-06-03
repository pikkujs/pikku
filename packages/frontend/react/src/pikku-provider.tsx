import { createContext, useContext, type ReactNode } from 'react'
import type { CorePikkuFetch } from '@pikku/fetch'

export type PikkuInstance<
  Fetch extends CorePikkuFetch = CorePikkuFetch,
  RPC = any,
  Realtime = any,
> = {
  fetch: Fetch
  rpc: RPC
  /** Optional — present when createPikku is called with a PikkuRealtime class. */
  realtime?: Realtime
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
