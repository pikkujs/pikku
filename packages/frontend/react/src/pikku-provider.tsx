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
