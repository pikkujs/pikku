/**
 * Tests for addon RPC invocations
 * Verifies that addon functions can be called via RPC with proper typing
 */

import { pikkuSessionlessFunc } from '#pikku'

export type TestAddonHelloInput = { name: string; greeting?: string }
export type TestAddonHelloOutput = {
  message: string
  timestamp: number
  noopCalls: number
}

/**
 * Test function that calls addon's hello function via RPC
 */
export const testAddonHello = pikkuSessionlessFunc<
  TestAddonHelloInput,
  TestAddonHelloOutput
>({
  func: async (_, data, { rpc }) => {
    // Call addon function via RPC namespace
    return await rpc.invoke('ext:hello', data)
  },
  remote: true,
})

/**
 * Test function that calls addon's hello function via RPC
 */
export const testBrokenRPCCall = pikkuSessionlessFunc<void, void>({
  func: async (_, data, { rpc }) => {
    // @ts-expect-error Testing broken RPC call
    await rpc.invoke('notexisint:hello', data)
  },
  remote: true,
})
