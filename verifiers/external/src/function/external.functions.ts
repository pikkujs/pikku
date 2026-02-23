/**
 * Tests for external package RPC invocations
 * Verifies that external package functions can be called via RPC with proper typing
 */

import { pikkuSessionlessFunc } from '#pikku'

export type TestExternalHelloInput = { name: string; greeting?: string }
export type TestExternalHelloOutput = {
  message: string
  timestamp: number
  noopCalls: number
}

/**
 * Test function that calls external package's hello function via RPC
 */
export const testExternalHello = pikkuSessionlessFunc<
  TestExternalHelloInput,
  TestExternalHelloOutput
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:hello', data)
  },
})
