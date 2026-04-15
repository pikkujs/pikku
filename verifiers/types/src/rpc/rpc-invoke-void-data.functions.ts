/**
 * Functions for testing RPC invoke type safety with void vs object inputs.
 */

import { pikkuSessionlessFunc } from '#pikku'

export const VoidInputRPCOutput = { timestamp: 0 }

export const voidInputRPC = pikkuSessionlessFunc<void, { timestamp: number }>({
  expose: true,
  auth: false,
  func: async () => {
    return { timestamp: Date.now() }
  },
})

export const objectInputRPC = pikkuSessionlessFunc<
  { name: string },
  { greeting: string }
>({
  expose: true,
  auth: false,
  func: async (_services, { name }) => {
    return { greeting: `Hello ${name}` }
  },
})

export const optionalInputRPC = pikkuSessionlessFunc<
  { filter?: string },
  { items: string[] }
>({
  expose: true,
  auth: false,
  func: async (_services, { filter }) => {
    return { items: filter ? [filter] : [] }
  },
})
