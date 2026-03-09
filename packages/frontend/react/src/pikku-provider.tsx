import { createContext, useContext, type ReactNode } from 'react'
import type { CorePikkuFetch } from '@pikku/fetch'

export type PikkuInstance<Fetch extends CorePikkuFetch = CorePikkuFetch, RPC = any> = {
  fetch: Fetch
  rpc: RPC
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

export const usePikkuFetch = <Fetch extends CorePikkuFetch = CorePikkuFetch>(): Fetch => {
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
